import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";
import {
  Copy,
  Shield,
  Users,
  MessageSquare,
  X,
  Video,
  VideoOff,
  Mic,
  Phone,
  Maximize2,
  Minimize2,
  CameraOff,
  MicOff,
  Share2,
  ArrowLeft,
} from "lucide-react";
import toast from "react-hot-toast";

const RoomPage = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();

  const userName = searchParams.get("name") || "User";
  const userId = useRef(
    `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );

  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [peerConnections, setPeerConnections] = useState(new Map());
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("initializing");
  const [isMobile, setIsMobile] = useState(false);
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [hasMicAccess, setHasMicAccess] = useState(false);
  const [activeScreenShare, setActiveScreenShare] = useState(null);
  const [showPermissionOverlay, setShowPermissionOverlay] = useState(false);
  const [isJoiningMeeting, setIsJoiningMeeting] = useState(false);
  const [roomReady, setRoomReady] = useState(false);

  // Store references
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isMountedRef = useRef(true);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      return mobile;
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("resize", checkMobile);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // WebRTC configuration
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
  };

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      setConnectionStatus("requesting-media");

      const constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      if (videoTrack) videoTrack.enabled = isVideoEnabled;
      if (audioTrack) audioTrack.enabled = isAudioEnabled;

      setLocalStream(stream);
      localStreamRef.current = stream;
      setConnectionStatus("connected");

      // Add tracks to existing peer connections if any
      peerConnections.forEach((pc) => {
        if (pc.connectionState !== "closed") {
          stream.getTracks().forEach((track) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === track.kind);
            if (!sender) {
              try {
                pc.addTrack(track, stream);
              } catch (err) {
                console.warn("Failed to add track:", err);
              }
            }
          });
        }
      });

      toast.success("Camera and microphone ready!");
      return stream;
    } catch (error) {
      console.error("Media error:", error);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        // Continue without media
        setHasCameraAccess(false);
        setHasMicAccess(false);
        setConnectionStatus("connected");
        toast.info("Joining without camera/microphone");
        return null;
      } else {
        toast.error("Failed to access media devices");
        setConnectionStatus("error");
        return null;
      }
    }
  }, [isVideoEnabled, isAudioEnabled, peerConnections]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Handle negotiation needed
        pc.onnegotiationneeded = () => {
          console.log(`Negotiation needed with ${targetUserId}`);
          sendOffer(pc, targetUserId);
        };

        // Add local tracks if available
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            if (track.kind === "video" && !isVideoEnabled && !isScreenSharing)
              return;
            if (track.kind === "audio" && !isAudioEnabled) return;

            try {
              pc.addTrack(track, localStreamRef.current);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log(`Received track from ${targetUserId}`, event.streams);
          if (event.streams && event.streams[0]) {
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, event.streams[0]);
              return newMap;
            });
          }
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate && socket?.connected) {
            socket.emit("ice-candidate", {
              candidate: event.candidate,
              to: targetUserId,
              from: userId.current,
            });
          }
        };

        // Connection state monitoring
        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          console.log(`ICE state with ${targetUserId}:`, state);

          if (state === "connected" || state === "completed") {
            console.log(`✅ Connected to ${targetUserId}`);
          } else if (state === "failed") {
            console.log(
              `❌ Connection failed with ${targetUserId}, restarting ICE...`
            );
            // Try to restart ICE
            setTimeout(() => {
              if (isMountedRef.current && peerConnections.has(targetUserId)) {
                const newPc = createPeerConnection(targetUserId);
                if (newPc) {
                  sendOffer(newPc, targetUserId);
                }
              }
            }, 1000);
          }
        };

        // Store connection
        setPeerConnections((prev) => {
          const newMap = new Map(prev);
          newMap.set(targetUserId, pc);
          return newMap;
        });

        return pc;
      } catch (error) {
        console.error("Failed to create peer connection:", error);
        return null;
      }
    },
    [
      socket,
      configuration,
      isVideoEnabled,
      isAudioEnabled,
      isScreenSharing,
      peerConnections,
    ]
  );

  // Send offer to a participant
  const sendOffer = async (pc, targetUserId) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      socket.emit("offer", {
        offer: pc.localDescription,
        to: targetUserId,
        from: userId.current,
      });
    } catch (error) {
      console.error("Error sending offer:", error);
    }
  };

  // Setup socket and room
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log("Waiting for socket connection...");
      return;
    }

    console.log(`Joining room: ${roomId}`);
    socket.emit("join-room", {
      roomId,
      userId: userId.current,
      userName,
    });

    // Setup socket event handlers
    const handleRoomJoined = ({ participants: existingParticipants }) => {
      if (!isMountedRef.current) return;

      console.log(
        "Room joined, existing participants:",
        existingParticipants.length
      );
      setParticipants(existingParticipants);
      setRoomReady(true);
      setShowPermissionOverlay(true);
    };

    const handleUserJoined = (participant) => {
      if (!isMountedRef.current || participant.userId === userId.current)
        return;

      console.log(`New user joined: ${participant.userName}`);
      setParticipants((prev) => {
        const exists = prev.some((p) => p.userId === participant.userId);
        if (exists) return prev;
        return [...prev, participant];
      });
    };

    const handleUserLeft = ({ userId: leftUserId }) => {
      if (!isMountedRef.current) return;

      console.log(`User left: ${leftUserId}`);
      setParticipants((prev) => prev.filter((p) => p.userId !== leftUserId));

      // Cleanup
      setPeerConnections((prev) => {
        const newMap = new Map(prev);
        const pc = newMap.get(leftUserId);
        if (pc) pc.close();
        newMap.delete(leftUserId);
        return newMap;
      });

      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(leftUserId);
        return newMap;
      });
    };

    const handleOffer = async ({ offer, from }) => {
      if (!isMountedRef.current) return;

      console.log(`Received offer from ${from}`);
      let pc = peerConnections.get(from);
      if (!pc) {
        pc = createPeerConnection(from);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          answer: pc.localDescription,
          to: from,
          from: userId.current,
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswer = async ({ answer, from }) => {
      console.log(`Received answer from ${from}`);
      const pc = peerConnections.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    };

    const handleIceCandidate = async ({ candidate, from }) => {
      const pc = peerConnections.get(from);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    };

    const handleNewMessage = (message) => {
      if (isMountedRef.current) {
        setMessages((prev) => [...prev, message]);
      }
    };

    // Attach all handlers
    socket.on("room-joined", handleRoomJoined);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("new-message", handleNewMessage);

    // Cleanup
    return () => {
      isMountedRef.current = false;

      if (socket) {
        socket.off("room-joined");
        socket.off("user-joined");
        socket.off("user-left");
        socket.off("offer");
        socket.off("answer");
        socket.off("ice-candidate");
        socket.off("new-message");

        socket.emit("leave-room", { roomId, userId: userId.current });
      }

      peerConnections.forEach((pc) => {
        if (pc) pc.close();
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [socket, isConnected, roomId, userName]);

  // Handle permission decision
  const handlePermissionDecision = async (allowCamera) => {
    setShowPermissionOverlay(false);

    if (allowCamera) {
      await initializeMedia();
    } else {
      setHasCameraAccess(false);
      setHasMicAccess(false);
      setConnectionStatus("connected");
    }

    setIsJoiningMeeting(true);

    // Now create connections with existing participants
    participants.forEach((participant, index) => {
      if (participant.userId !== userId.current) {
        setTimeout(() => {
          if (!isMountedRef.current) return;
          const pc = createPeerConnection(participant.userId);
          if (pc) {
            sendOffer(pc, participant.userId);
          }
        }, index * 500);
      }
    });
  };

  // Control functions
  const toggleVideo = async () => {
    if (!localStreamRef.current) {
      await initializeMedia();
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const newState = !videoTrack.enabled;
      videoTrack.enabled = newState;
      setIsVideoEnabled(newState);

      peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      });

      toast.success(newState ? "Video enabled" : "Video disabled");
    } else if (!hasCameraAccess) {
      toast.error("No camera available");
    }
  };

  const toggleAudio = async () => {
    if (!localStreamRef.current) {
      await initializeMedia();
      return;
    }

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newState = !audioTrack.enabled;
      audioTrack.enabled = newState;
      setIsAudioEnabled(newState);

      peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender && audioTrack) {
          sender.replaceTrack(audioTrack);
        }
      });

      toast.success(newState ? "Audio enabled" : "Audio muted");
    } else if (!hasMicAccess) {
      toast.error("No microphone available");
    }
  };

  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);
        setActiveScreenShare(userId.current);

        const screenTrack = screenStream.getVideoTracks()[0];
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack);
          } else if (screenTrack) {
            pc.addTrack(screenTrack, screenStreamRef.current);
          }
        });

        screenTrack.onended = () => {
          handleScreenShare();
        };

        toast.success("Screen sharing started");
      } else {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        setIsScreenSharing(false);
        setActiveScreenShare(null);

        const replacementTrack = localStreamRef.current
          ? localStreamRef.current.getVideoTracks()[0]
          : null;

        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(replacementTrack);
          }
        });

        toast.success("Screen sharing stopped");
      }
    } catch (error) {
      console.error("Screen share error:", error);
      if (error.name !== "NotAllowedError") {
        toast.error("Failed to share screen");
      }
    }
  };

  const toggleFullscreen = () => {
    const elem = document.documentElement;
    if (!isFullscreen) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied!");
  };

  const leaveRoom = () => {
    navigate("/");
    toast.success("Left the meeting");
  };

  const sendMessage = (message) => {
    if (socket?.connected) {
      socket.emit("send-message", {
        roomId,
        userId: userId.current,
        userName,
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // Show permission overlay when room is ready
  if (showPermissionOverlay && !isJoiningMeeting) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-primary-500/10 rounded-full flex items-center justify-center">
            <Video className="h-10 w-10 text-primary-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">Join Meeting</h1>
          <p className="text-gray-400 mb-6">
            QuantumSync works best with camera and microphone access. Would you
            like to enable them for this meeting?
          </p>

          <div className="space-y-3">
            <button
              onClick={() => handlePermissionDecision(true)}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition flex items-center justify-center space-x-2"
            >
              <Video className="h-5 w-5" />
              <span>Allow Camera & Microphone</span>
            </button>

            <button
              onClick={() => handlePermissionDecision(false)}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
            >
              Join Without Media
            </button>

            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg font-medium transition flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Home</span>
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Participants in room: {participants.length + 1}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show meeting room
  if (isJoiningMeeting) {
    // Mobile layout
    if (isMobile) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-100 overflow-hidden">
          {/* Mobile Header */}
          <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-b border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Shield className="h-6 w-6 text-primary-500" />
                <div>
                  <p className="text-sm font-medium text-white">QuantumSync</p>
                  <p className="text-xs text-gray-400 truncate max-w-[150px]">
                    {roomId} • {participants.length + 1} online
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyRoomId}
                  className="p-2 bg-gray-800 rounded-lg"
                  title="Copy Room ID"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setShowParticipants(!showParticipants)}
                  className="p-2 bg-gray-800 rounded-lg"
                  title="Participants"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="pt-16 pb-24 px-2">
            <VideoGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              participants={participants}
              isVideoEnabled={isVideoEnabled}
              userName={userName}
              connectionStatus={connectionStatus}
              isMobile={true}
              activeScreenShare={activeScreenShare}
            />
          </div>

          {/* Mobile Control Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 p-3 z-40">
            <div className="flex items-center justify-around">
              <button
                onClick={toggleVideo}
                className={`flex flex-col items-center p-3 rounded-lg transition ${
                  isVideoEnabled && hasCameraAccess
                    ? "bg-gray-800"
                    : "bg-red-600"
                }`}
                disabled={!hasCameraAccess}
              >
                {hasCameraAccess ? (
                  isVideoEnabled ? (
                    <Video className="h-5 w-5 text-green-400" />
                  ) : (
                    <VideoOff className="h-5 w-5 text-white" />
                  )
                ) : (
                  <CameraOff className="h-5 w-5 text-red-400" />
                )}
                <span className="text-xs mt-1 text-gray-300">
                  {hasCameraAccess
                    ? isVideoEnabled
                      ? "Video"
                      : "Off"
                    : "No Cam"}
                </span>
              </button>

              <button
                onClick={toggleAudio}
                className={`flex flex-col items-center p-3 rounded-lg transition ${
                  isAudioEnabled && hasMicAccess ? "bg-gray-800" : "bg-red-600"
                }`}
                disabled={!hasMicAccess}
              >
                {hasMicAccess ? (
                  isAudioEnabled ? (
                    <Mic className="h-5 w-5 text-green-400" />
                  ) : (
                    <MicOff className="h-5 w-5 text-white" />
                  )
                ) : (
                  <MicOff className="h-5 w-5 text-red-400" />
                )}
                <span className="text-xs mt-1 text-gray-300">
                  {hasMicAccess
                    ? isAudioEnabled
                      ? "Audio"
                      : "Muted"
                    : "No Mic"}
                </span>
              </button>

              <button
                onClick={handleScreenShare}
                className={`flex flex-col items-center p-3 rounded-lg transition ${
                  isScreenSharing ? "bg-blue-600" : "bg-gray-800"
                }`}
              >
                <Share2
                  className={`h-5 w-5 ${
                    isScreenSharing ? "text-white" : "text-blue-400"
                  }`}
                />
                <span className="text-xs mt-1 text-gray-300">
                  {isScreenSharing ? "Stop" : "Share"}
                </span>
              </button>

              <button
                onClick={() => setShowChat(!showChat)}
                className="flex flex-col items-center p-3 rounded-lg bg-gray-800 transition relative"
              >
                <MessageSquare className="h-5 w-5 text-purple-400" />
                <span className="text-xs mt-1 text-gray-300">Chat</span>
                {messages.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {messages.length}
                  </span>
                )}
              </button>

              <button
                onClick={leaveRoom}
                className="flex flex-col items-center p-3 rounded-lg bg-red-600 transition"
              >
                <Phone className="h-5 w-5 text-white transform rotate-135" />
                <span className="text-xs mt-1 text-white">Leave</span>
              </button>
            </div>
          </div>

          {/* Mobile Overlay Panels */}
          {showChat && (
            <div className="fixed inset-0 bg-gray-950 z-50 pt-16">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                  <h3 className="text-lg font-semibold text-white">Chat</h3>
                  <button
                    onClick={() => setShowChat(false)}
                    className="p-2 hover:bg-gray-800 rounded-lg"
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ChatPanel
                    messages={messages}
                    onSendMessage={sendMessage}
                    currentUserId={userId.current}
                    mobile={true}
                  />
                </div>
              </div>
            </div>
          )}

          {showParticipants && (
            <div className="fixed inset-0 bg-gray-950 z-50 pt-16">
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                  <h3 className="text-lg font-semibold text-white">
                    Participants ({participants.length + 1})
                  </h3>
                  <button
                    onClick={() => setShowParticipants(false)}
                    className="p-2 hover:bg-gray-800 rounded-lg"
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <ParticipantsPanel
                    participants={participants}
                    currentUser={{ userId: userId.current, userName }}
                    mobile={true}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Desktop layout
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Header */}
        <header className="bg-gray-900/90 backdrop-blur-lg border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <Shield className="h-8 w-8 text-primary-500" />
                  <div>
                    <h1 className="text-xl font-bold text-white">
                      QuantumSync
                    </h1>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <span className="flex items-center space-x-1">
                        <Users className="h-4 w-4" />
                        <span>{participants.length + 1} online</span>
                      </span>
                      <span>•</span>
                      <span className="font-mono">{roomId}</span>
                      {activeScreenShare && (
                        <span className="flex items-center space-x-1 text-yellow-400">
                          <Share2 className="h-3 w-3" />
                          <span>Screen Sharing</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={copyRoomId}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
                  title="Copy Room ID"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copy ID</span>
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="p-2 hover:bg-gray-800 rounded-lg transition"
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </button>

                <button
                  onClick={() => setShowParticipants(!showParticipants)}
                  className={`p-2 rounded-lg transition ${
                    showParticipants ? "bg-gray-800" : "hover:bg-gray-800"
                  }`}
                  title="Participants"
                >
                  <Users className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setShowChat(!showChat)}
                  className={`p-2 rounded-lg transition relative ${
                    showChat ? "bg-gray-800" : "hover:bg-gray-800"
                  }`}
                  title="Chat"
                >
                  <MessageSquare className="h-5 w-5" />
                  {messages.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {messages.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex space-x-6">
            {/* Main Video Area */}
            <div
              className={`flex-1 ${
                showChat || showParticipants ? "lg:w-3/4" : "w-full"
              }`}
            >
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                participants={participants}
                isVideoEnabled={isVideoEnabled}
                userName={userName}
                connectionStatus={connectionStatus}
                isMobile={false}
                activeScreenShare={activeScreenShare}
              />

              <ControlBar
                isVideoEnabled={isVideoEnabled && hasCameraAccess}
                isAudioEnabled={isAudioEnabled && hasMicAccess}
                isScreenSharing={isScreenSharing}
                onToggleVideo={toggleVideo}
                onToggleAudio={toggleAudio}
                onToggleScreenShare={handleScreenShare}
                onLeaveRoom={leaveRoom}
                onToggleFullscreen={toggleFullscreen}
                hasCameraAccess={hasCameraAccess}
                hasMicAccess={hasMicAccess}
              />
            </div>

            {/* Side Panels */}
            {(showChat || showParticipants) && (
              <div className="space-y-6 lg:w-1/4">
                {showParticipants && (
                  <div className="relative">
                    <button
                      onClick={() => setShowParticipants(false)}
                      className="absolute top-2 right-2 p-1 hover:bg-gray-800 rounded-lg z-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <ParticipantsPanel
                      participants={participants}
                      currentUser={{ userId: userId.current, userName }}
                      mobile={false}
                    />
                  </div>
                )}

                {showChat && (
                  <div className="relative">
                    <button
                      onClick={() => setShowChat(false)}
                      className="absolute top-2 right-2 p-1 hover:bg-gray-800 rounded-lg z-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <ChatPanel
                      messages={messages}
                      onSendMessage={sendMessage}
                      currentUserId={userId.current}
                      mobile={false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Initial loading state (shown while waiting for socket)
  if (!roomReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="relative">
            <div className="w-24 h-24 mx-auto border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-12 w-12 text-primary-500" />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">
              Joining Meeting...
            </h2>
            <p className="text-gray-400">Connecting to room: {roomId}</p>
            {!isConnected && (
              <p className="text-yellow-400 text-sm">
                Waiting for connection...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // This shouldn't happen, but just in case
  return null;
};

export default RoomPage;
