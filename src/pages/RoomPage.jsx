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
  RefreshCw,
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
  const [debugInfo, setDebugInfo] = useState("");

  // Store references
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isMountedRef = useRef(true);
  const pendingOffers = useRef(new Map());
  const videoElements = useRef(new Map());

  // Debug logging
  const addDebugLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setDebugInfo(message);
  }, []);

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
  };

  // Initialize media - FIXED VERSION
  const initializeMedia = useCallback(async () => {
    try {
      setConnectionStatus("requesting-media");
      addDebugLog("Requesting camera and microphone...");

      // Try different constraints
      const constraints = {
        video: {
          width: { ideal: 640, min: 320 },
          height: { ideal: 480, min: 240 },
          frameRate: { ideal: 24, min: 15 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      // Try to get media stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!stream) {
        throw new Error("No stream returned from getUserMedia");
      }

      // Check what we got
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      addDebugLog(
        `Got stream: ${videoTracks.length} video, ${audioTracks.length} audio tracks`
      );

      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        addDebugLog(
          `Video track: ${videoTrack.label}, enabled: ${videoTrack.enabled}, readyState: ${videoTrack.readyState}`
        );
        videoTrack.enabled = isVideoEnabled;
      }

      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        audioTrack.enabled = isAudioEnabled;
      }

      setHasCameraAccess(videoTracks.length > 0);
      setHasMicAccess(audioTracks.length > 0);

      // Store stream
      setLocalStream(stream);
      localStreamRef.current = stream;
      setConnectionStatus("connected");

      // Log stream info
      console.log("🎥 Local stream details:", {
        id: stream.id,
        active: stream.active,
        videoTracks: videoTracks.length,
        audioTracks: audioTracks.length,
      });

      toast.success("Camera and microphone ready!");
      return stream;
    } catch (error) {
      console.error("❌ Media error:", error);
      addDebugLog(`Media error: ${error.message}`);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
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
  }, [isVideoEnabled, isAudioEnabled, addDebugLog]);

  // Create peer connection - SIMPLIFIED AND FIXED
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        addDebugLog(`Creating peer connection with ${targetUserId}`);

        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc && existingPc.connectionState !== "closed") {
          addDebugLog(`Closing existing connection with ${targetUserId}`);
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Add local tracks if available
        if (localStreamRef.current) {
          const tracks = localStreamRef.current.getTracks();
          addDebugLog(
            `Adding ${tracks.length} local tracks to ${targetUserId}`
          );

          tracks.forEach((track) => {
            try {
              // Don't add disabled tracks
              if (track.kind === "video" && !track.enabled) return;
              if (track.kind === "audio" && !track.enabled) return;

              pc.addTrack(track, localStreamRef.current);
              addDebugLog(`Added ${track.kind} track to ${targetUserId}`);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        } else {
          addDebugLog("⚠️ No local stream available");
        }

        // Handle remote tracks - CRITICAL FIX
        pc.ontrack = (event) => {
          addDebugLog(
            `Received ${event.track.kind} track from ${targetUserId}`
          );

          if (event.streams && event.streams.length > 0) {
            const remoteStream = event.streams[0];

            // Check stream status
            console.log(`Remote stream from ${targetUserId}:`, {
              id: remoteStream.id,
              active: remoteStream.active,
              videoTracks: remoteStream.getVideoTracks().length,
              audioTracks: remoteStream.getAudioTracks().length,
            });

            // Update state
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, remoteStream);
              return newMap;
            });

            // Force re-render
            setTimeout(() => {
              if (isMountedRef.current) {
                setRemoteStreams((current) => new Map(current));
              }
            }, 100);
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
          addDebugLog(`ICE state with ${targetUserId}: ${state}`);

          if (state === "connected" || state === "completed") {
            addDebugLog(`✅ Connected to ${targetUserId}`);
            toast.success(`Connected to ${targetUserId}`);
          } else if (state === "failed") {
            addDebugLog(`❌ Connection failed with ${targetUserId}`);
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
        addDebugLog(`Failed to create PC: ${error.message}`);
        return null;
      }
    },
    [socket, configuration, peerConnections, addDebugLog]
  );

  // Send offer
  const sendOffer = async (pc, targetUserId) => {
    try {
      addDebugLog(`Sending offer to ${targetUserId}`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      if (socket?.connected) {
        socket.emit("offer", {
          offer: pc.localDescription,
          to: targetUserId,
          from: userId.current,
        });
      }
    } catch (error) {
      console.error("Error sending offer:", error);
    }
  };

  // Connect to participant
  const connectToParticipant = useCallback(
    (participant) => {
      if (participant.userId === userId.current) return;

      addDebugLog(`Connecting to ${participant.userId}`);

      const pc = createPeerConnection(participant.userId);
      if (pc) {
        // Send offer after a short delay
        setTimeout(() => {
          if (pc.signalingState === "stable") {
            sendOffer(pc, participant.userId);
          }
        }, 500);
      }
    },
    [createPeerConnection]
  );

  // Setup socket
  useEffect(() => {
    if (!socket || !isConnected) {
      addDebugLog("Waiting for socket connection...");
      return;
    }

    addDebugLog(`Joining room: ${roomId}`);
    socket.emit("join-room", {
      roomId,
      userId: userId.current,
      userName,
    });

    // Event handlers
    const handleRoomJoined = ({ participants: existingParticipants }) => {
      if (!isMountedRef.current) return;

      addDebugLog(`Room joined. Participants: ${existingParticipants.length}`);
      setParticipants(existingParticipants);
      setRoomReady(true);
      setShowPermissionOverlay(true);
    };

    const handleUserJoined = (participant) => {
      if (!isMountedRef.current || participant.userId === userId.current)
        return;

      addDebugLog(`New user joined: ${participant.userName}`);
      setParticipants((prev) => {
        const exists = prev.some((p) => p.userId === participant.userId);
        if (exists) return prev;
        return [...prev, participant];
      });

      // Connect to new user
      if (isJoiningMeeting) {
        setTimeout(() => {
          connectToParticipant(participant);
        }, 1000);
      }
    };

    const handleUserLeft = ({ userId: leftUserId }) => {
      if (!isMountedRef.current) return;

      addDebugLog(`User left: ${leftUserId}`);
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
      if (!isMountedRef.current || from === userId.current) return;

      addDebugLog(`Received offer from ${from}`);
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
      addDebugLog(`Received answer from ${from}`);
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
      addDebugLog("Cleaning up...");

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
  }, [
    socket,
    isConnected,
    roomId,
    userName,
    isJoiningMeeting,
    connectToParticipant,
    addDebugLog,
  ]);

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

    // Connect to existing participants
    setTimeout(() => {
      addDebugLog(`Connecting to ${participants.length} participants...`);
      participants.forEach((participant, index) => {
        if (participant.userId !== userId.current) {
          setTimeout(() => {
            connectToParticipant(participant);
          }, index * 1000);
        }
      });
    }, 1500);
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

      // Update all peer connections
      peerConnections.forEach((pc, targetUserId) => {
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

      // Update all peer connections
      peerConnections.forEach((pc, targetUserId) => {
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
        peerConnections.forEach((pc, targetUserId) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack);
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

        peerConnections.forEach((pc, targetUserId) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && replacementTrack) {
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

  // Refresh connections - FIXED VERSION
  const refreshConnections = () => {
    addDebugLog("🔄 Refreshing all connections...");

    // Close all existing connections
    peerConnections.forEach((pc, id) => {
      if (pc) {
        addDebugLog(`Closing connection with ${id}`);
        pc.close();
      }
    });

    // Clear states
    setPeerConnections(new Map());
    setRemoteStreams(new Map());

    // Reconnect to all participants
    setTimeout(() => {
      addDebugLog(`Reconnecting to ${participants.length} participants...`);
      participants.forEach((participant, index) => {
        if (participant.userId !== userId.current) {
          setTimeout(() => {
            connectToParticipant(participant);
          }, index * 1000);
        }
      });
    }, 500);

    toast.info("Refreshing connections...");
  };

  // Debug panel
  const renderDebugPanel = () => (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-black/80 text-white text-xs p-3 rounded-lg max-w-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold">Debug Info</span>
          <button
            onClick={refreshConnections}
            className="p-1 bg-blue-600 rounded text-xs hover:bg-blue-700"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-1">
          <div>User: {userId.current}</div>
          <div>Participants: {participants.length}</div>
          <div>Peer Connections: {peerConnections.size}</div>
          <div>Remote Streams: {remoteStreams.size}</div>
          <div>Local Stream: {localStream ? "Yes" : "No"}</div>
          <div className="text-yellow-300 truncate">{debugInfo}</div>
        </div>
      </div>
    </div>
  );

  // Show permission overlay
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
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Header */}
        <header className="bg-gray-900/90 backdrop-blur-lg border-b border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="h-6 w-6 text-primary-500" />
              <div>
                <h1 className="text-lg font-bold text-white">QuantumSync</h1>
                <p className="text-xs text-gray-400">
                  {roomId} • {participants.length + 1} online
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={copyRoomId}
                className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
                title="Copy Room ID"
              >
                <Copy className="h-4 w-4" />
              </button>

              <button
                onClick={refreshConnections}
                className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
                title="Refresh Connections"
              >
                <RefreshCw className="h-4 w-4" />
              </button>

              {!isMobile && (
                <button
                  onClick={toggleFullscreen}
                  className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
                  title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className={`p-4 ${isMobile ? "" : "flex space-x-4"}`}>
          {/* Main Video Area */}
          <div className={isMobile ? "w-full mb-4" : "flex-1"}>
            <VideoGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              participants={participants}
              isVideoEnabled={isVideoEnabled}
              userName={userName}
              connectionStatus={connectionStatus}
              isMobile={isMobile}
              activeScreenShare={activeScreenShare}
            />

            {/* Control Bar */}
            <div
              className={`mt-4 ${
                isMobile
                  ? "fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-3"
                  : "flex justify-center space-x-4"
              }`}
            >
              <button
                onClick={toggleVideo}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg transition ${
                  isVideoEnabled && hasCameraAccess
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {hasCameraAccess ? (
                  isVideoEnabled ? (
                    <Video
                      className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                    />
                  ) : (
                    <VideoOff
                      className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                    />
                  )
                ) : (
                  <CameraOff
                    className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                  />
                )}
                {!isMobile && (
                  <span>
                    {hasCameraAccess
                      ? isVideoEnabled
                        ? "Video On"
                        : "Video Off"
                      : "No Camera"}
                  </span>
                )}
                {isMobile && (
                  <span className="text-xs mt-1">
                    {hasCameraAccess
                      ? isVideoEnabled
                        ? "Video"
                        : "Off"
                      : "No Cam"}
                  </span>
                )}
              </button>

              <button
                onClick={toggleAudio}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg transition ${
                  isAudioEnabled && hasMicAccess
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {hasMicAccess ? (
                  isAudioEnabled ? (
                    <Mic
                      className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                    />
                  ) : (
                    <MicOff
                      className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                    />
                  )
                ) : (
                  <MicOff
                    className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                  />
                )}
                {!isMobile && (
                  <span>
                    {hasMicAccess
                      ? isAudioEnabled
                        ? "Audio On"
                        : "Audio Off"
                      : "No Mic"}
                  </span>
                )}
                {isMobile && (
                  <span className="text-xs mt-1">
                    {hasMicAccess
                      ? isAudioEnabled
                        ? "Audio"
                        : "Muted"
                      : "No Mic"}
                  </span>
                )}
              </button>

              <button
                onClick={handleScreenShare}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg transition ${
                  isScreenSharing
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-gray-800 hover:bg-gray-700"
                }`}
              >
                <Share2
                  className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                />
                {!isMobile && (
                  <span>{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
                )}
                {isMobile && (
                  <span className="text-xs mt-1">
                    {isScreenSharing ? "Stop" : "Share"}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowChat(!showChat)}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg bg-gray-800 hover:bg-gray-700 transition relative`}
              >
                <MessageSquare
                  className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`}
                />
                {!isMobile && <span>Chat</span>}
                {isMobile && <span className="text-xs mt-1">Chat</span>}
                {messages.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {messages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg bg-gray-800 hover:bg-gray-700 transition`}
              >
                <Users className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`} />
                {!isMobile && <span>Participants</span>}
                {isMobile && <span className="text-xs mt-1">People</span>}
              </button>

              <button
                onClick={leaveRoom}
                className={`${
                  isMobile
                    ? "flex flex-col items-center p-3"
                    : "flex items-center px-4 py-2"
                } rounded-lg bg-red-600 hover:bg-red-700 transition`}
              >
                <Phone className={`${isMobile ? "h-5 w-5" : "h-4 w-4 mr-2"}`} />
                {!isMobile && <span>Leave</span>}
                {isMobile && <span className="text-xs mt-1">Leave</span>}
              </button>
            </div>
          </div>

          {/* Side Panels - Desktop */}
          {!isMobile && (showChat || showParticipants) && (
            <div className="w-80 space-y-4">
              {showParticipants && (
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">
                      Participants ({participants.length + 1})
                    </h3>
                    <button
                      onClick={() => setShowParticipants(false)}
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ParticipantsPanel
                    participants={participants}
                    currentUser={{ userId: userId.current, userName }}
                  />
                </div>
              )}

              {showChat && (
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">Chat</h3>
                    <button
                      onClick={() => setShowChat(false)}
                      className="p-1 hover:bg-gray-800 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ChatPanel
                    messages={messages}
                    onSendMessage={sendMessage}
                    currentUserId={userId.current}
                  />
                </div>
              )}
            </div>
          )}
        </main>

        {/* Mobile Overlay Panels */}
        {isMobile && showChat && (
          <div className="fixed inset-0 bg-gray-950 z-50 pt-16">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-lg font-semibold text-white">Chat</h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-2 hover:bg-gray-800 rounded-lg"
                >
                  <X className="h-5 w-5" />
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

        {isMobile && showParticipants && (
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
                  <X className="h-5 w-5" />
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

        {/* Debug Panel */}
        {renderDebugPanel()}
      </div>
    );
  }

  // Loading state
  if (!roomReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="relative">
            <div className="w-20 h-20 mx-auto border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-10 w-10 text-primary-500" />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-white">Joining Meeting...</h2>
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

  return null;
};

export default RoomPage;
