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
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const RoomPage = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();

  const userName = searchParams.get("name") || "Anonymous";
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
  const [connectionStatus, setConnectionStatus] = useState("initializing");
  const [hasMediaPermission, setHasMediaPermission] = useState(false);
  const [activeConnections, setActiveConnections] = useState(new Set());

  // Configuration for WebRTC - Simplified for reliability
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      console.log("Initializing media...");
      setConnectionStatus("requesting-permission");

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log("Media obtained successfully");
      setLocalStream(stream);
      setHasMediaPermission(true);
      setConnectionStatus("connected");

      // Enable tracks
      stream.getVideoTracks()[0].enabled = isVideoEnabled;
      stream.getAudioTracks()[0].enabled = isAudioEnabled;

      return stream;
    } catch (error) {
      console.error("Media initialization error:", error);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        toast.error("Please allow camera and microphone access");
        setConnectionStatus("permission-denied");
      } else {
        toast.error("Failed to access media devices");
        setConnectionStatus("error");
      }

      return null;
    }
  }, [isVideoEnabled, isAudioEnabled]);

  // Create a single peer connection for testing (mesh topology alternative)
  const createSinglePeerConnection = useCallback(
    (targetUserId) => {
      console.log(`Creating single peer connection for: ${targetUserId}`);

      try {
        // Close existing connection first
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          console.log(`Closing existing connection for ${targetUserId}`);
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Add local tracks
        if (localStream) {
          localStream.getTracks().forEach((track) => {
            if (track.kind === "video" && !isVideoEnabled) return;
            if (track.kind === "audio" && !isAudioEnabled) return;

            try {
              pc.addTrack(track, localStream);
              console.log(`Added ${track.kind} track`);
            } catch (err) {
              console.error("Error adding track:", err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log(`Received remote track from ${targetUserId}`);

          if (event.streams && event.streams[0]) {
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, event.streams[0]);
              return newMap;
            });

            setActiveConnections((prev) => {
              const newSet = new Set(prev);
              newSet.add(targetUserId);
              return newSet;
            });
          }
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate && socket && socket.connected) {
            socket.emit("ice-candidate", {
              candidate: event.candidate,
              to: targetUserId,
              from: userId.current,
            });
          }
        };

        // Connection state tracking
        pc.oniceconnectionstatechange = () => {
          console.log(`ICE state with ${targetUserId}:`, pc.iceConnectionState);

          if (
            pc.iceConnectionState === "connected" ||
            pc.iceConnectionState === "completed"
          ) {
            setConnectionStatus("connected");
            toast.success(`Connected to ${targetUserId}`);
          }

          if (pc.iceConnectionState === "failed") {
            console.log(`ICE failed with ${targetUserId}, restarting...`);
            setTimeout(() => {
              if (pc.iceConnectionState === "failed") {
                pc.restartIce();
              }
            }, 2000);
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
        console.error("Error creating peer connection:", error);
        toast.error("Failed to create connection");
        return null;
      }
    },
    [localStream, isVideoEnabled, isAudioEnabled, socket, peerConnections]
  );

  // Initialize and join room
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log("Socket not connected yet");
      return;
    }

    const setupRoom = async () => {
      console.log("Setting up room...");

      // Initialize media first
      const stream = await initializeMedia();
      if (!stream) {
        toast.error("Failed to initialize media");
        return;
      }

      // Join room
      console.log("Joining room...");
      socket.emit("join-room", {
        roomId,
        userId: userId.current,
        userName,
      });

      // Set up socket event handlers
      const handlers = {
        "room-joined": ({ participants: existingParticipants }) => {
          console.log("Room joined with participants:", existingParticipants);
          setParticipants(existingParticipants);

          // LIMIT: Only connect to first 3 participants to avoid browser limits
          const participantsToConnect = existingParticipants.slice(0, 3);

          participantsToConnect.forEach(async (participant) => {
            if (participant.userId !== userId.current) {
              console.log(`Will connect to participant: ${participant.userId}`);
              // Delay connection to prevent overwhelming
              setTimeout(() => {
                createSinglePeerConnection(participant.userId);
              }, 1000 * participantsToConnect.indexOf(participant));
            }
          });
        },

        "user-joined": (participant) => {
          console.log("New user joined:", participant);
          if (participant.userId !== userId.current) {
            setParticipants((prev) => [...prev, participant]);

            // Only connect if we have less than 3 active connections
            if (activeConnections.size < 3) {
              setTimeout(() => {
                createSinglePeerConnection(participant.userId);
              }, 1000);
            } else {
              console.log(
                "Connection limit reached, not connecting to new user"
              );
            }
          }
        },

        "user-left": ({ userId: leftUserId }) => {
          console.log("User left:", leftUserId);
          setParticipants((prev) =>
            prev.filter((p) => p.userId !== leftUserId)
          );

          // Clean up connection
          setPeerConnections((prev) => {
            const newMap = new Map(prev);
            const pc = newMap.get(leftUserId);
            if (pc) {
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

          setActiveConnections((prev) => {
            const newSet = new Set(prev);
            newSet.delete(leftUserId);
            return newSet;
          });
        },

        offer: async ({ offer, from }) => {
          console.log(`Received offer from ${from}`);

          let pc = peerConnections.get(from);
          if (!pc) {
            pc = createSinglePeerConnection(from);
          }

          if (pc) {
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
          }
        },

        answer: async ({ answer, from }) => {
          console.log(`Received answer from ${from}`);
          const pc = peerConnections.get(from);

          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
              console.error("Error handling answer:", error);
            }
          }
        },

        "ice-candidate": async ({ candidate, from }) => {
          const pc = peerConnections.get(from);

          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        },

        "new-message": (message) => {
          setMessages((prev) => [...prev, message]);
        },

        "room-error": ({ message }) => {
          toast.error(message);
          if (message.includes("full")) {
            setTimeout(() => navigate("/"), 2000);
          }
        },
      };

      // Attach handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.on(event, handler);
      });

      // Cleanup
      return () => {
        console.log("Cleaning up room...");
        Object.keys(handlers).forEach((event) => {
          socket.off(event);
        });

        socket.emit("leave-room", { roomId, userId: userId.current });

        // Close all connections
        peerConnections.forEach((pc) => {
          if (pc) {
            pc.close();
          }
        });

        // Stop media tracks
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
      };
    };

    setupRoom();
  }, [
    socket,
    isConnected,
    roomId,
    userName,
    navigate,
    initializeMedia,
    createSinglePeerConnection,
    peerConnections,
    activeConnections,
  ]);

  // Control functions
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        setIsVideoEnabled(newState);

        // Update all active connections
        peerConnections.forEach((pc, targetUserId) => {
          if (activeConnections.has(targetUserId)) {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (sender && videoTrack) {
              sender.replaceTrack(videoTrack);
            }
          }
        });

        socket.emit("toggle-video", {
          roomId,
          userId: userId.current,
          enabled: newState,
        });

        toast.success(newState ? "Video enabled" : "Video disabled");
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const newState = !audioTrack.enabled;
        audioTrack.enabled = newState;
        setIsAudioEnabled(newState);

        peerConnections.forEach((pc, targetUserId) => {
          if (activeConnections.has(targetUserId)) {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "audio");
            if (sender && audioTrack) {
              sender.replaceTrack(audioTrack);
            }
          }
        });

        socket.emit("toggle-audio", {
          roomId,
          userId: userId.current,
          enabled: newState,
        });

        toast.success(newState ? "Audio enabled" : "Audio muted");
      }
    }
  };

  const sendMessage = (message) => {
    socket.emit("send-message", {
      roomId,
      userId: userId.current,
      userName,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied!");
  };

  const leaveRoom = () => {
    navigate("/");
    toast("Left the meeting", { icon: "👋" });
  };

  // Connection status UI
  if (connectionStatus !== "connected") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-blue-500/10 rounded-full flex items-center justify-center">
            {connectionStatus === "requesting-permission" ||
            connectionStatus === "initializing" ? (
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            ) : (
              <AlertCircle className="h-10 w-10 text-blue-400" />
            )}
          </div>

          <h1 className="text-2xl font-bold mb-4">
            {connectionStatus === "requesting-permission"
              ? "Requesting Camera Access"
              : connectionStatus === "initializing"
              ? "Initializing Meeting"
              : "Setup Required"}
          </h1>

          <p className="text-gray-400 mb-6">
            {connectionStatus === "requesting-permission"
              ? "Please allow camera and microphone access in your browser."
              : "Setting up your meeting room..."}
          </p>

          {connectionStatus === "permission-denied" && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
            >
              Grant Permissions & Retry
            </button>
          )}

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Participants: {participants.length + 1}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main UI when connected
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-lg border-b border-gray-800">
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
                      <span>{participants.length + 1} participants</span>
                    </span>
                    <span>•</span>
                    <span>Connections: {activeConnections.size}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={copyRoomId}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
              >
                <Copy className="h-4 w-4" />
                <span>Copy Room ID</span>
              </button>

              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className={`p-2 rounded-lg transition ${
                  showParticipants ? "bg-gray-800" : "hover:bg-gray-800"
                }`}
              >
                <Users className="h-5 w-5" />
              </button>

              <button
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-lg transition relative ${
                  showChat ? "bg-gray-800" : "hover:bg-gray-800"
                }`}
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
            />

            <ControlBar
              isVideoEnabled={isVideoEnabled}
              isAudioEnabled={isAudioEnabled}
              isScreenSharing={isScreenSharing}
              onToggleVideo={toggleVideo}
              onToggleAudio={toggleAudio}
              onToggleScreenShare={() => toast.info("Screen share coming soon")}
              onLeaveRoom={leaveRoom}
            />
          </div>

          {/* Side Panels */}
          <div
            className={`space-y-6 ${
              showChat || showParticipants ? "lg:w-1/4" : "hidden"
            }`}
          >
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
                />
              </div>
            )}
          </div>
        </div>

        {/* Connection Info Banner */}
        {activeConnections.size === 0 && participants.length > 0 && (
          <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-pulse rounded-full h-4 w-4 bg-yellow-500"></div>
              <span className="text-yellow-400">
                Connecting to {participants.length} participant(s)... This may
                take a moment.
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RoomPage;
