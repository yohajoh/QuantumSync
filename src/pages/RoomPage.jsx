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
  Mic,
  Phone,
  Maximize2,
  Minimize2,
  CameraOff,
  MicOff,
  Share2,
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

  // Store references for cleanup
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

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
      { urls: "stun:stun3.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      console.log("📹 Initializing media...");
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
          channelCount: 2,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Media obtained successfully");

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      if (videoTrack) videoTrack.enabled = isVideoEnabled;
      if (audioTrack) audioTrack.enabled = isAudioEnabled;

      setLocalStream(stream);
      localStreamRef.current = stream;
      setConnectionStatus("connected");

      return stream;
    } catch (error) {
      console.error("❌ Media error:", error);

      if (error.name === "NotAllowedError") {
        toast.error("Please allow camera and microphone access");
        setConnectionStatus("permission-denied");
      } else {
        toast.error("Failed to access media devices");
        setConnectionStatus("error");
      }

      // Create placeholder
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("No Camera", 320, 240);

      const placeholderStream = canvas.captureStream(1);
      setLocalStream(placeholderStream);
      localStreamRef.current = placeholderStream;
      setConnectionStatus("connected-no-media");

      return placeholderStream;
    }
  }, [isVideoEnabled, isAudioEnabled]);

  // Create peer connection - UPDATED for better reliability
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        console.log(`🔗 Creating peer connection for: ${targetUserId}`);

        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          console.log(`Closing existing connection for ${targetUserId}`);
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Add local tracks
        const streamToUse =
          isScreenSharing && screenStreamRef.current
            ? screenStreamRef.current
            : localStreamRef.current;
        if (streamToUse) {
          streamToUse.getTracks().forEach((track) => {
            if (track.kind === "video" && !isVideoEnabled && !isScreenSharing)
              return;
            if (track.kind === "audio" && !isAudioEnabled) return;

            try {
              pc.addTrack(track, streamToUse);
              console.log(`✅ Added ${track.kind} track to ${targetUserId}`);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log(`📥 Received remote track from ${targetUserId}`);
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
          console.log(
            `❄️ ICE state with ${targetUserId}:`,
            pc.iceConnectionState
          );
          if (
            pc.iceConnectionState === "connected" ||
            pc.iceConnectionState === "completed"
          ) {
            console.log(`✅ Successfully connected to ${targetUserId}`);
          } else if (pc.iceConnectionState === "failed") {
            console.log(
              `❌ Connection failed with ${targetUserId}, restarting ICE...`
            );
            setTimeout(() => {
              if (pc.iceConnectionState === "failed") {
                pc.restartIce();
              }
            }, 2000);
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(
            `🔌 Connection state with ${targetUserId}:`,
            pc.connectionState
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
        console.error("❌ Failed to create peer connection:", error);
        return null;
      }
    },
    [socket, peerConnections, isVideoEnabled, isAudioEnabled, isScreenSharing]
  );

  // Handle screen sharing
  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            displaySurface: "monitor",
          },
          audio: false,
        });

        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);
        setActiveScreenShare(userId.current);

        // Replace video track in all peer connections
        const screenTrack = screenStream.getVideoTracks()[0];
        peerConnections.forEach((pc, targetUserId) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack);
            console.log(
              `🖥️ Replaced video track for ${targetUserId} with screen share`
            );
          }
        });

        // Handle screen share stop
        screenTrack.onended = () => {
          handleScreenShare();
        };

        toast.success("Screen sharing started");
        socket.emit("screen-share-started", { roomId, userId: userId.current });
      } else {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => track.stop());
          screenStreamRef.current = null;
        }

        setIsScreenSharing(false);
        setActiveScreenShare(null);

        // Restore camera track
        if (localStreamRef.current) {
          const cameraTrack = localStreamRef.current.getVideoTracks()[0];
          if (cameraTrack) {
            peerConnections.forEach((pc, targetUserId) => {
              const sender = pc
                .getSenders()
                .find((s) => s.track?.kind === "video");
              if (sender && cameraTrack) {
                sender.replaceTrack(cameraTrack);
                console.log(`📹 Restored camera track for ${targetUserId}`);
              }
            });
          }
        }

        toast.success("Screen sharing stopped");
        socket.emit("screen-share-stopped", { roomId, userId: userId.current });
      }
    } catch (error) {
      console.error("❌ Screen share error:", error);
      if (error.name !== "NotAllowedError") {
        toast.error("Failed to share screen");
      }
    }
  };

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

      console.log(`📤 Sent offer to ${targetUserId}`);
    } catch (error) {
      console.error("❌ Error sending offer:", error);
    }
  };

  // Initialize and setup room
  useEffect(() => {
    let isMounted = true;
    let cleanupTimeout;

    const setupRoom = async () => {
      if (!socket || !isConnected) {
        console.log("⏳ Waiting for socket connection...");
        return;
      }

      try {
        // Initialize media
        await initializeMedia();
        if (!isMounted) return;

        // Join room
        console.log(`🚪 Joining room: ${roomId}`);
        socket.emit("join-room", {
          roomId,
          userId: userId.current,
          userName,
        });

        // Setup socket event handlers
        const handlers = {
          "room-joined": ({ participants: existingParticipants }) => {
            if (!isMounted) return;

            console.log(
              "✅ Room joined, existing participants:",
              existingParticipants.length
            );
            setParticipants(existingParticipants);

            // Create connections with existing participants
            existingParticipants.forEach(async (participant, index) => {
              if (participant.userId !== userId.current) {
                setTimeout(() => {
                  if (!isMounted) return;
                  const pc = createPeerConnection(participant.userId);
                  if (pc) {
                    sendOffer(pc, participant.userId);
                  }
                }, index * 500); // Stagger connections
              }
            });
          },

          "user-joined": (participant) => {
            if (!isMounted || participant.userId === userId.current) return;

            console.log(`👤 New user joined: ${participant.userName}`);
            setParticipants((prev) => [...prev, participant]);

            // Create connection with new participant
            setTimeout(() => {
              if (!isMounted) return;
              const pc = createPeerConnection(participant.userId);
              if (pc) {
                sendOffer(pc, participant.userId);
              }
            }, 500);
          },

          "user-left": ({ userId: leftUserId }) => {
            if (!isMounted) return;

            console.log(`👋 User left: ${leftUserId}`);
            setParticipants((prev) =>
              prev.filter((p) => p.userId !== leftUserId)
            );

            // Cleanup connection
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
          },

          offer: async ({ offer, from }) => {
            if (!isMounted) return;

            console.log(`📥 Received offer from ${from}`);
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

              console.log(`📤 Sent answer to ${from}`);
            } catch (error) {
              console.error("❌ Error handling offer:", error);
            }
          },

          answer: async ({ answer, from }) => {
            console.log(`📥 Received answer from ${from}`);
            const pc = peerConnections.get(from);
            if (pc) {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(answer)
                );
                console.log(`✅ Set remote description from ${from}`);
              } catch (error) {
                console.error("❌ Error handling answer:", error);
              }
            }
          },

          "ice-candidate": async ({ candidate, from }) => {
            const pc = peerConnections.get(from);
            if (pc && candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`✅ Added ICE candidate from ${from}`);
              } catch (error) {
                console.error("❌ Error adding ICE candidate:", error);
              }
            }
          },

          "new-message": (message) => {
            if (isMounted) {
              setMessages((prev) => [...prev, message]);
            }
          },

          "screen-share-started": ({ userId: sharerId }) => {
            setActiveScreenShare(sharerId);
            if (sharerId !== userId.current) {
              toast.info(
                `${
                  participants.find((p) => p.userId === sharerId)?.userName ||
                  "Someone"
                } started screen sharing`
              );
            }
          },

          "screen-share-stopped": ({ userId: sharerId }) => {
            if (sharerId === activeScreenShare) {
              setActiveScreenShare(null);
            }
          },

          "video-toggled": ({ userId: targetUserId, enabled }) => {
            setParticipants((prev) =>
              prev.map((p) =>
                p.userId === targetUserId ? { ...p, videoEnabled: enabled } : p
              )
            );
          },

          "audio-toggled": ({ userId: targetUserId, enabled }) => {
            setParticipants((prev) =>
              prev.map((p) =>
                p.userId === targetUserId ? { ...p, audioEnabled: enabled } : p
              )
            );
          },
        };

        // Attach all handlers
        Object.entries(handlers).forEach(([event, handler]) => {
          socket.on(event, handler);
        });
      } catch (error) {
        console.error("❌ Room setup error:", error);
        toast.error("Failed to setup room");
      }
    };

    setupRoom();

    // Schedule cleanup
    cleanupTimeout = setTimeout(() => {
      if (!isMounted) return;

      // Check for stuck connections
      const allParticipants = participants.length + 1;
      if (allParticipants > 1 && remoteStreams.size === 0) {
        console.log(
          "🔄 No remote streams detected, attempting to reconnect..."
        );
        // Re-trigger connection setup
        participants.forEach((participant) => {
          if (participant.userId !== userId.current) {
            const pc = createPeerConnection(participant.userId);
            if (pc) {
              sendOffer(pc, participant.userId);
            }
          }
        });
      }
    }, 10000); // Check after 10 seconds

    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(cleanupTimeout);

      // Remove socket listeners
      if (socket) {
        socket.off("room-joined");
        socket.off("user-joined");
        socket.off("user-left");
        socket.off("offer");
        socket.off("answer");
        socket.off("ice-candidate");
        socket.off("new-message");
        socket.off("screen-share-started");
        socket.off("screen-share-stopped");
        socket.off("video-toggled");
        socket.off("audio-toggled");

        socket.emit("leave-room", { roomId, userId: userId.current });
      }

      // Close peer connections
      peerConnections.forEach((pc) => {
        if (pc) pc.close();
      });

      // Stop media tracks
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
    initializeMedia,
    createPeerConnection,
  ]);

  // Control functions
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        setIsVideoEnabled(newState);

        // Update all peer connections
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });

        socket.emit("toggle-video", {
          roomId,
          userId: userId.current,
          enabled: newState,
        });

        toast.success(newState ? "Video enabled" : "Video disabled");
      } else if (!hasCameraAccess) {
        toast.error("No camera available");
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const newState = !audioTrack.enabled;
        audioTrack.enabled = newState;
        setIsAudioEnabled(newState);

        // Update all peer connections
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender && audioTrack) {
            sender.replaceTrack(audioTrack);
          }
        });

        socket.emit("toggle-audio", {
          roomId,
          userId: userId.current,
          enabled: newState,
        });

        toast.success(newState ? "Audio enabled" : "Audio muted");
      } else if (!hasMicAccess) {
        toast.error("No microphone available");
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

  // Show loading state
  if (
    connectionStatus === "initializing" ||
    connectionStatus === "requesting-media"
  ) {
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
              Setting Up Meeting
            </h2>
            <p className="text-gray-400">Initializing video conference...</p>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-300"></div>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus === "permission-denied") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center">
            <CameraOff className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">
            Permission Required
          </h1>
          <p className="text-gray-400 mb-6">
            Camera and microphone access is required for video calls.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
            >
              Refresh & Allow Permissions
            </button>
            <button
              onClick={() => {
                setConnectionStatus("connected-no-media");
                toast.info("Joining without camera/microphone");
              }}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
            >
              Join Without Media
            </button>
            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg font-medium transition"
            >
              Leave Meeting
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        {/* Screen Share Indicator */}
        {activeScreenShare && (
          <div className="fixed top-16 left-4 right-4 z-40 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Share2 className="h-4 w-4 text-yellow-400" />
                <span className="text-sm text-yellow-300">
                  {activeScreenShare === userId.current
                    ? "You are sharing your screen"
                    : `${
                        participants.find((p) => p.userId === activeScreenShare)
                          ?.userName || "Someone"
                      } is sharing screen`}
                </span>
              </div>
              {activeScreenShare === userId.current && (
                <button
                  onClick={handleScreenShare}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        )}

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

          {/* Connection Status */}
          {participants.length > 0 &&
            remoteStreams.size < participants.length && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span className="text-blue-400 text-sm">
                    Connecting to {participants.length - remoteStreams.size}{" "}
                    participant(s)...
                  </span>
                </div>
              </div>
            )}
        </div>

        {/* Mobile Control Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 p-3 z-40">
          <div className="flex items-center justify-around">
            <button
              onClick={toggleVideo}
              className={`flex flex-col items-center p-3 rounded-lg transition ${
                isVideoEnabled && hasCameraAccess ? "bg-gray-800" : "bg-red-600"
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
                {hasMicAccess ? (isAudioEnabled ? "Audio" : "Muted") : "No Mic"}
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
                  <h1 className="text-xl font-bold text-white">QuantumSync</h1>
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

            {/* Connection Status */}
            {participants.length > 0 &&
              remoteStreams.size < participants.length && (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      <span className="text-blue-400">
                        Connecting to {participants.length - remoteStreams.size}{" "}
                        participant(s)...
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        // Reconnect to all participants
                        participants.forEach((participant) => {
                          if (
                            participant.userId !== userId.current &&
                            !remoteStreams.has(participant.userId)
                          ) {
                            const pc = createPeerConnection(participant.userId);
                            if (pc) {
                              sendOffer(pc, participant.userId);
                            }
                          }
                        });
                        toast.info("Attempting to reconnect...");
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              )}

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
};

export default RoomPage;
