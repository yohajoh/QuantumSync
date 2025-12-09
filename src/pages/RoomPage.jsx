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

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // WebRTC configuration
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 5,
  };

  // Initialize media ONCE - FIX for vibration
  const initializeMedia = useCallback(async () => {
    if (localStream) {
      console.log("Media already initialized");
      return localStream;
    }

    try {
      console.log("Initializing media...");
      setConnectionStatus("requesting-media");

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
      console.log("Media obtained successfully");

      // Store stream immediately to prevent re-initialization
      setLocalStream(stream);
      setConnectionStatus("connected");

      // Set initial track states
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) videoTrack.enabled = isVideoEnabled;
      if (audioTrack) audioTrack.enabled = isAudioEnabled;

      return stream;
    } catch (error) {
      console.error("Media error:", error);

      // Handle specific errors
      if (error.name === "NotAllowedError") {
        toast.error("Please allow camera and microphone access");
        setConnectionStatus("permission-denied");
      } else if (error.name === "NotFoundError") {
        toast.error("No camera or microphone found");
        setConnectionStatus("no-devices");
      } else {
        toast.error("Failed to access media devices");
        setConnectionStatus("error");
      }

      // Create a placeholder stream to continue without media
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Camera Not Available", 320, 240);

      const placeholderStream = canvas.captureStream(30);
      setLocalStream(placeholderStream);
      setConnectionStatus("connected-no-media");

      return placeholderStream;
    }
  }, [localStream, isVideoEnabled, isAudioEnabled]);

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

        // Add local tracks if available
        if (localStream) {
          localStream.getTracks().forEach((track) => {
            if (track.kind === "video" && !isVideoEnabled) return;
            if (track.kind === "audio" && !isAudioEnabled) return;

            try {
              pc.addTrack(track, localStream);
            } catch (err) {
              console.warn("Failed to add track:", err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            const remoteStream = event.streams[0];
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, remoteStream);
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
          console.log(`ICE state with ${targetUserId}:`, pc.iceConnectionState);
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
    [localStream, isVideoEnabled, isAudioEnabled, socket, peerConnections]
  );

  // Initialize and setup room
  useEffect(() => {
    let isMounted = true;
    let mediaStream = null;

    const setupRoom = async () => {
      if (!socket || !isConnected) {
        console.log("Waiting for socket connection...");
        return;
      }

      try {
        // Step 1: Initialize media
        mediaStream = await initializeMedia();
        if (!isMounted) return;

        // Step 2: Join room
        console.log("Joining room:", roomId);
        socket.emit("join-room", {
          roomId,
          userId: userId.current,
          userName,
        });

        // Step 3: Setup socket event handlers
        socket.on("room-joined", ({ participants: existingParticipants }) => {
          if (!isMounted) return;

          console.log(
            "Room joined, existing participants:",
            existingParticipants
          );
          setParticipants(existingParticipants);

          // Create connections with existing participants (limit to 4 for stability)
          existingParticipants
            .slice(0, 4)
            .forEach(async (participant, index) => {
              if (participant.userId !== userId.current) {
                setTimeout(() => {
                  if (!isMounted) return;
                  const pc = createPeerConnection(participant.userId);
                  if (pc) {
                    // Create and send offer
                    pc.createOffer()
                      .then((offer) => pc.setLocalDescription(offer))
                      .then(() => {
                        socket.emit("offer", {
                          offer: pc.localDescription,
                          to: participant.userId,
                          from: userId.current,
                        });
                      })
                      .catch(console.error);
                  }
                }, index * 1000); // Stagger connections
              }
            });
        });

        socket.on("user-joined", (participant) => {
          if (!isMounted || participant.userId === userId.current) return;

          setParticipants((prev) => [...prev, participant]);

          // Create connection with new participant
          const pc = createPeerConnection(participant.userId);
          if (pc) {
            pc.createOffer()
              .then((offer) => pc.setLocalDescription(offer))
              .then(() => {
                socket.emit("offer", {
                  offer: pc.localDescription,
                  to: participant.userId,
                  from: userId.current,
                });
              })
              .catch(console.error);
          }
        });

        socket.on("user-left", ({ userId: leftUserId }) => {
          if (!isMounted) return;

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
        });

        socket.on("offer", async ({ offer, from }) => {
          if (!isMounted) return;

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
        });

        socket.on("answer", async ({ answer, from }) => {
          const pc = peerConnections.get(from);
          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
              console.error("Error handling answer:", error);
            }
          }
        });

        socket.on("ice-candidate", async ({ candidate, from }) => {
          const pc = peerConnections.get(from);
          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
        });

        socket.on("new-message", (message) => {
          if (isMounted) {
            setMessages((prev) => [...prev, message]);
          }
        });
      } catch (error) {
        console.error("Room setup error:", error);
        toast.error("Failed to setup room");
      }
    };

    setupRoom();

    // Cleanup
    return () => {
      isMounted = false;

      // Remove socket listeners
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

      // Close peer connections
      peerConnections.forEach((pc) => {
        if (pc) pc.close();
      });

      // Stop media tracks
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
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
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        setIsVideoEnabled(newState);

        // Update peer connections
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
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

        // Update peer connections
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) {
            sender.replaceTrack(audioTrack);
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
    setIsFullscreen(!isFullscreen);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied!");
  };

  const leaveRoom = () => {
    navigate("/");
    toast.success("Left the meeting");
  };

  // Show loading state
  if (
    connectionStatus === "initializing" ||
    connectionStatus === "requesting-media"
  ) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 mx-auto border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-12 w-12 text-primary-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">
              Setting Up Your Meeting
            </h2>
            <p className="text-gray-400">
              Initializing camera and microphone...
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Room: <span className="font-mono text-primary-400">{roomId}</span>
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
            <Video className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">
            Permission Required
          </h1>
          <p className="text-gray-400 mb-6">
            QuantumSync needs access to your camera and microphone for video
            calls. Please refresh and allow permissions when prompted.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
            >
              Refresh & Allow Permissions
            </button>
            <button
              onClick={leaveRoom}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
            >
              Leave Meeting
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                <span className="hidden sm:inline">Copy ID</span>
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
        <div className={`${isMobile ? "flex flex-col" : "flex space-x-6"}`}>
          {/* Main Video Area */}
          <div
            className={`${
              isMobile
                ? "w-full mb-4"
                : showChat || showParticipants
                ? "lg:w-3/4"
                : "w-full"
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
              onToggleScreenShare={() =>
                toast.info("Screen sharing coming soon")
              }
              onLeaveRoom={leaveRoom}
              onToggleFullscreen={toggleFullscreen}
            />
          </div>

          {/* Side Panels */}
          {(showChat || showParticipants) && (
            <div
              className={`${isMobile ? "w-full mt-4" : "space-y-6 lg:w-1/4"}`}
            >
              {showParticipants && (
                <div className="relative">
                  {!isMobile && (
                    <button
                      onClick={() => setShowParticipants(false)}
                      className="absolute top-2 right-2 p-1 hover:bg-gray-800 rounded-lg z-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <ParticipantsPanel
                    participants={participants}
                    currentUser={{ userId: userId.current, userName }}
                  />
                </div>
              )}

              {showChat && (
                <div className="relative">
                  {!isMobile && (
                    <button
                      onClick={() => setShowChat(false)}
                      className="absolute top-2 right-2 p-1 hover:bg-gray-800 rounded-lg z-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <ChatPanel
                    messages={messages}
                    onSendMessage={(msg) => {
                      socket.emit("send-message", {
                        roomId,
                        userId: userId.current,
                        userName,
                        message: msg,
                        timestamp: new Date().toISOString(),
                      });
                    }}
                    currentUserId={userId.current}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Connection Status Toast */}
      {participants.length > 0 && remoteStreams.size === 0 && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <div className="animate-pulse rounded-full h-2 w-2 bg-blue-500"></div>
              <span className="text-blue-400 text-sm">
                Connecting to {participants.length} participant(s)...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
