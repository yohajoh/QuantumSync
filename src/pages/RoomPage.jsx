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
  const userId = useRef(`user_${Date.now()}`);

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
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [isMobile, setIsMobile] = useState(false);
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [hasMicAccess, setHasMicAccess] = useState(false);
  const [activeScreenShare, setActiveScreenShare] = useState(null);
  const [showPermissionOverlay, setShowPermissionOverlay] = useState(false);
  const [isJoiningMeeting, setIsJoiningMeeting] = useState(false);
  const [roomReady, setRoomReady] = useState(false);

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isMountedRef = useRef(true);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
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
  };

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      console.log("🎥 Requesting media...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      videoTrack.enabled = isVideoEnabled;
      audioTrack.enabled = isAudioEnabled;

      setLocalStream(stream);
      localStreamRef.current = stream;
      setConnectionStatus("connected");

      console.log("✅ Media initialized");
      toast.success("Camera and microphone ready!");
      return stream;
    } catch (error) {
      console.error("❌ Media error:", error);
      if (error.name === "NotAllowedError") {
        setHasCameraAccess(false);
        setHasMicAccess(false);
        toast.info("Joining without camera/microphone");
        return null;
      }
      toast.error("Failed to access media devices");
      return null;
    }
  }, [isVideoEnabled, isAudioEnabled]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        console.log(`🔗 Creating peer connection with ${targetUserId}`);

        // Close existing connection
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Add local tracks
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            try {
              pc.addTrack(track, localStreamRef.current);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log(`📹 Received track from ${targetUserId}`);
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

        // Connection state
        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          console.log(`🌐 ICE state with ${targetUserId}: ${state}`);

          if (state === "connected" || state === "completed") {
            console.log(`✅ Connected to ${targetUserId}`);
            toast.success(`Connected to participant`);
          } else if (state === "failed") {
            console.log(`❌ Connection failed with ${targetUserId}`);
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
    [socket, configuration, peerConnections]
  );

  // Send offer
  const sendOffer = async (pc, targetUserId) => {
    try {
      console.log(`📤 Sending offer to ${targetUserId}`);
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

  // Setup socket
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log("⌛ Waiting for socket connection...");
      return;
    }

    console.log(`🚀 Joining room: ${roomId}`);
    socket.emit("join-room", {
      roomId,
      userId: userId.current,
      userName,
    });

    // Event handlers
    const handleRoomJoined = ({ participants: existingParticipants }) => {
      console.log(
        `✅ Room joined. Participants: ${existingParticipants.length}`
      );
      setParticipants(existingParticipants);
      setRoomReady(true);
      setShowPermissionOverlay(true);
    };

    const handleUserJoined = (participant) => {
      if (participant.userId === userId.current) return;

      console.log(`👤 New user joined: ${participant.userName}`);
      setParticipants((prev) => {
        const exists = prev.some((p) => p.userId === participant.userId);
        if (exists) return prev;
        return [...prev, participant];
      });

      // Connect to new user
      if (isJoiningMeeting) {
        setTimeout(() => {
          const pc = createPeerConnection(participant.userId);
          if (pc) {
            sendOffer(pc, participant.userId);
          }
        }, 1000);
      }
    };

    const handleUserLeft = ({ userId: leftUserId }) => {
      console.log(`👋 User left: ${leftUserId}`);
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
      if (from === userId.current) return;

      console.log(`📨 Received offer from ${from}`);
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
      console.log(`📨 Received answer from ${from}`);
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
      setMessages((prev) => [...prev, message]);
    };

    // Attach handlers
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

      socket.off("room-joined");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("new-message");

      socket.emit("leave-room", { roomId, userId: userId.current });

      peerConnections.forEach((pc) => pc.close());

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    socket,
    isConnected,
    roomId,
    userName,
    isJoiningMeeting,
    createPeerConnection,
  ]);

  // Handle permission
  const handlePermissionDecision = async (allowCamera) => {
    setShowPermissionOverlay(false);
    setIsJoiningMeeting(true);

    if (allowCamera) {
      await initializeMedia();
    } else {
      setHasCameraAccess(false);
      setHasMicAccess(false);
    }

    // Connect to existing participants
    setTimeout(() => {
      participants.forEach((participant, index) => {
        if (participant.userId !== userId.current) {
          setTimeout(() => {
            const pc = createPeerConnection(participant.userId);
            if (pc) {
              sendOffer(pc, participant.userId);
            }
          }, index * 500);
        }
      });
    }, 1000);
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
          }
        });

        screenTrack.onended = () => handleScreenShare();
        toast.success("Screen sharing started");
      } else {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        setIsScreenSharing(false);
        setActiveScreenShare(null);

        const replacementTrack = localStreamRef.current?.getVideoTracks()[0];
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && replacementTrack) {
            sender.replaceTrack(replacementTrack);
          }
        });

        toast.success("Screen sharing stopped");
      }
    } catch (error) {
      if (error.name !== "NotAllowedError") {
        toast.error("Failed to share screen");
      }
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
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

  // Permission overlay
  if (showPermissionOverlay && !isJoiningMeeting) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-primary-500/10 rounded-full flex items-center justify-center">
            <Video className="h-10 w-10 text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Join Meeting</h1>
          <p className="text-gray-400 mb-6">
            Would you like to enable camera and microphone for this meeting?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => handlePermissionDecision(true)}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
            >
              Allow Camera & Microphone
            </button>
            <button
              onClick={() => handlePermissionDecision(false)}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
            >
              Join Without Media
            </button>
            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg font-medium transition"
            >
              Back to Home
            </button>
          </div>
          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Meeting room
  if (isJoiningMeeting) {
    if (isMobile) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
          {/* Mobile Header */}
          <div className="fixed top-0 left-0 right-0 bg-gray-900 border-b border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">QuantumSync</p>
                <p className="text-xs text-gray-400">
                  {roomId} • {participants.length + 1} online
                </p>
              </div>
              <button
                onClick={copyRoomId}
                className="p-2 bg-gray-800 rounded-lg"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Video Grid */}
          <div className="pt-20 pb-24">
            <VideoGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              participants={participants}
              isVideoEnabled={isVideoEnabled}
              userName={userName}
              connectionStatus={connectionStatus}
              isMobile={true}
            />
          </div>

          {/* Mobile Controls */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-4">
            <div className="flex justify-around">
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-lg ${
                  isVideoEnabled ? "bg-gray-800" : "bg-red-600"
                }`}
              >
                {isVideoEnabled ? (
                  <Video className="h-5 w-5" />
                ) : (
                  <VideoOff className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-lg ${
                  isAudioEnabled ? "bg-gray-800" : "bg-red-600"
                }`}
              >
                {isAudioEnabled ? (
                  <Mic className="h-5 w-5" />
                ) : (
                  <MicOff className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={handleScreenShare}
                className={`p-3 rounded-lg ${
                  isScreenSharing ? "bg-blue-600" : "bg-gray-800"
                }`}
              >
                <Share2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowChat(!showChat)}
                className="p-3 rounded-lg bg-gray-800"
              >
                <MessageSquare className="h-5 w-5" />
              </button>
              <button onClick={leaveRoom} className="p-3 rounded-lg bg-red-600">
                <Phone className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Chat Panel */}
          {showChat && (
            <div className="fixed inset-0 bg-gray-950 z-50 pt-20">
              <ChatPanel
                messages={messages}
                onSendMessage={sendMessage}
                currentUserId={userId.current}
                mobile={true}
                onClose={() => setShowChat(false)}
              />
            </div>
          )}
        </div>
      );
    }

    // Desktop layout
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Header */}
        <header className="bg-gray-900 border-b border-gray-800 p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">QuantumSync</h1>
              <p className="text-sm text-gray-400">
                {roomId} • {participants.length + 1} online
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={copyRoomId}
                className="px-4 py-2 bg-gray-800 rounded-lg"
              >
                Copy Room ID
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-gray-800 rounded-lg"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4">
          <div className="flex space-x-6">
            {/* Video Area */}
            <div className="flex-1">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                participants={participants}
                isVideoEnabled={isVideoEnabled}
                userName={userName}
                connectionStatus={connectionStatus}
                isMobile={false}
              />

              <div className="mt-6 flex justify-center space-x-4">
                <button
                  onClick={toggleVideo}
                  className={`px-6 py-3 rounded-lg ${
                    isVideoEnabled ? "bg-gray-800" : "bg-red-600"
                  }`}
                >
                  {isVideoEnabled ? "Video On" : "Video Off"}
                </button>
                <button
                  onClick={toggleAudio}
                  className={`px-6 py-3 rounded-lg ${
                    isAudioEnabled ? "bg-gray-800" : "bg-red-600"
                  }`}
                >
                  {isAudioEnabled ? "Audio On" : "Audio Off"}
                </button>
                <button
                  onClick={handleScreenShare}
                  className={`px-6 py-3 rounded-lg ${
                    isScreenSharing ? "bg-blue-600" : "bg-gray-800"
                  }`}
                >
                  {isScreenSharing ? "Stop Share" : "Share Screen"}
                </button>
                <button
                  onClick={leaveRoom}
                  className="px-6 py-3 bg-red-600 rounded-lg"
                >
                  Leave
                </button>
              </div>
            </div>

            {/* Chat Sidebar */}
            <div className="w-80">
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Chat</h3>
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className="p-1 hover:bg-gray-800 rounded"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </div>
                {showChat && (
                  <ChatPanel
                    messages={messages}
                    onSendMessage={sendMessage}
                    currentUserId={userId.current}
                    mobile={false}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Loading
  if (!roomReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Joining meeting...</p>
        </div>
      </div>
    );
  }

  return null;
};

// jjjjjjjjjjjjjjjjj

export default RoomPage;
