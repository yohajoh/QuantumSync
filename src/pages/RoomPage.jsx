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
  const [debugInfo, setDebugInfo] = useState("");

  // Store references
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const isMountedRef = useRef(true);
  const pendingIceCandidates = useRef(new Map());

  // Debug logging
  const addDebugLog = (message) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    setDebugInfo(message);
  };

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
      addDebugLog("Requesting camera and microphone...");

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
      addDebugLog("Media stream obtained successfully");

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      if (videoTrack) videoTrack.enabled = isVideoEnabled;
      if (audioTrack) audioTrack.enabled = isAudioEnabled;

      setLocalStream(stream);
      localStreamRef.current = stream;
      setConnectionStatus("connected");

      toast.success("Camera and microphone ready!");
      return stream;
    } catch (error) {
      console.error("Media error:", error);
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
  }, [isVideoEnabled, isAudioEnabled]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        addDebugLog(`Creating peer connection with ${targetUserId}`);

        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          addDebugLog(`Closing existing connection with ${targetUserId}`);
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Track stats
        const stats = {
          iceState: "new",
          connectionState: "new",
          tracksReceived: 0,
        };

        // Add local tracks if available
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            try {
              addDebugLog(`Adding ${track.kind} track to ${targetUserId}`);
              pc.addTrack(track, localStreamRef.current);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        }

        // Handle remote tracks - FIXED THIS PART
        pc.ontrack = (event) => {
          addDebugLog(
            `Received ${event.track.kind} track from ${targetUserId}`
          );
          stats.tracksReceived++;

          if (event.streams && event.streams.length > 0) {
            const stream = event.streams[0];

            // Check if stream has video tracks
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();

            addDebugLog(
              `Stream from ${targetUserId}: ${videoTracks.length} video, ${audioTracks.length} audio tracks`
            );

            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, stream);
              return newMap;
            });

            // Force re-render by updating state
            setTimeout(() => {
              if (isMountedRef.current) {
                setRemoteStreams((newMap) => {
                  const updatedMap = new Map(newMap);
                  updatedMap.set(targetUserId, stream);
                  return updatedMap;
                });
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
          stats.iceState = state;
          addDebugLog(`ICE state with ${targetUserId}: ${state}`);

          if (state === "connected" || state === "completed") {
            addDebugLog(`✅ Connected to ${targetUserId}`);
            toast.success(`Connected to ${targetUserId}`);

            // Process pending ICE candidates
            const pending = pendingIceCandidates.current.get(targetUserId);
            if (pending) {
              pending.forEach((candidate) => {
                pc.addIceCandidate(candidate);
              });
              pendingIceCandidates.current.delete(targetUserId);
            }
          } else if (state === "failed") {
            addDebugLog(`❌ Connection failed with ${targetUserId}`);
            // Try to restart ICE
            setTimeout(() => {
              if (isMountedRef.current && peerConnections.has(targetUserId)) {
                addDebugLog(`🔄 Restarting ICE with ${targetUserId}`);
                pc.restartIce();
              }
            }, 2000);
          }
        };

        pc.onconnectionstatechange = () => {
          stats.connectionState = pc.connectionState;
          addDebugLog(
            `Connection state with ${targetUserId}: ${pc.connectionState}`
          );
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
        addDebugLog(
          `Failed to create PC with ${targetUserId}: ${error.message}`
        );
        return null;
      }
    },
    [socket, configuration, peerConnections]
  );

  // Create and send offer
  const createOffer = async (pc, targetUserId) => {
    try {
      addDebugLog(`Creating offer for ${targetUserId}`);
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
      console.error("Error creating offer:", error);
      addDebugLog(`Offer error: ${error.message}`);
    }
  };

  // Setup socket and room
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

    // Setup socket event handlers
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

      // Connect to new user if we're already in the meeting
      if (isJoiningMeeting) {
        setTimeout(() => {
          const pc = createPeerConnection(participant.userId);
          if (pc) {
            createOffer(pc, participant.userId);
          }
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
        if (pc) {
          addDebugLog(`Closing PC for ${leftUserId}`);
          pc.close();
        }
        newMap.delete(leftUserId);
        return newMap;
      });

      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(leftUserId);
        return newMap;
      });

      pendingIceCandidates.current.delete(leftUserId);
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
        addDebugLog(`Sent answer to ${from}`);
      } catch (error) {
        console.error("Error handling offer:", error);
        addDebugLog(`Offer handling error: ${error.message}`);
      }
    };

    const handleAnswer = async ({ answer, from }) => {
      addDebugLog(`Received answer from ${from}`);
      const pc = peerConnections.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          addDebugLog(`Answer accepted from ${from}`);
        } catch (error) {
          console.error("Error handling answer:", error);
          addDebugLog(`Answer error: ${error.message}`);
        }
      }
    };

    const handleIceCandidate = async ({ candidate, from }) => {
      const pc = peerConnections.get(from);
      if (pc) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Store candidate until remote description is set
            const pending = pendingIceCandidates.current.get(from) || [];
            pending.push(new RTCIceCandidate(candidate));
            pendingIceCandidates.current.set(from, pending);
            addDebugLog(`Queued ICE candidate from ${from}`);
          }
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

      peerConnections.forEach((pc, id) => {
        if (pc) {
          addDebugLog(`Closing PC for ${id}`);
          pc.close();
        }
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
    createPeerConnection,
  ]);

  // Handle permission decision
  const handlePermissionDecision = async (allowCamera) => {
    setShowPermissionOverlay(false);
    setIsJoiningMeeting(true);

    let stream = null;
    if (allowCamera) {
      stream = await initializeMedia();
    } else {
      setHasCameraAccess(false);
      setHasMicAccess(false);
      setConnectionStatus("connected");
    }

    // Connect to existing participants
    addDebugLog(`Connecting to ${participants.length} participants...`);

    participants.forEach((participant, index) => {
      if (participant.userId !== userId.current) {
        setTimeout(() => {
          const pc = createPeerConnection(participant.userId);
          if (pc) {
            createOffer(pc, participant.userId);
          }
        }, index * 1000); // Stagger connections
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

      // Update all peer connections
      peerConnections.forEach((pc, targetUserId) => {
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

      // Update all peer connections
      peerConnections.forEach((pc, targetUserId) => {
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

  // Refresh connections
  const refreshConnections = () => {
    addDebugLog("Refreshing all connections...");

    // Close all existing connections
    peerConnections.forEach((pc, id) => {
      if (pc) pc.close();
    });

    setPeerConnections(new Map());
    setRemoteStreams(new Map());

    // Reconnect to all participants
    setTimeout(() => {
      participants.forEach((participant, index) => {
        if (participant.userId !== userId.current) {
          setTimeout(() => {
            const pc = createPeerConnection(participant.userId);
            if (pc) {
              createOffer(pc, participant.userId);
            }
          }, index * 1000);
        }
      });
    }, 500);
  };

  // Debug panel
  const renderDebugPanel = () => (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-black/80 text-white text-xs p-3 rounded-lg max-w-xs">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold">Debug Info</span>
          <button
            onClick={refreshConnections}
            className="p-1 bg-blue-600 rounded text-xs"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-1">
          <div>User ID: {userId.current}</div>
          <div>Participants: {participants.length}</div>
          <div>Peer Connections: {peerConnections.size}</div>
          <div>Remote Streams: {remoteStreams.size}</div>
          <div className="text-yellow-300">{debugInfo}</div>
        </div>
      </div>
    </div>
  );

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
                  onClick={refreshConnections}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                  title="Refresh Connections"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
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
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex space-x-6">
            {/* Main Video Area */}
            <div className="flex-1">
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
                onRefreshConnections={refreshConnections}
              />
            </div>

            {/* Side Panels */}
            <div className="w-80 space-y-6">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">
                    Participants ({participants.length + 1})
                  </h3>
                  <Users className="h-5 w-5 text-gray-400" />
                </div>
                <ParticipantsPanel
                  participants={participants}
                  currentUser={{ userId: userId.current, userName }}
                  mobile={false}
                />
              </div>

              <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Chat</h3>
                  <MessageSquare className="h-5 w-5 text-gray-400" />
                </div>
                <ChatPanel
                  messages={messages}
                  onSendMessage={sendMessage}
                  currentUserId={userId.current}
                  mobile={false}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Debug Panel */}
        {renderDebugPanel()}
      </div>
    );
  }

  // Initial loading state
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

  return null;
};

export default RoomPage;
