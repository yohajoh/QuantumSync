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
  const [connectionStatus, setConnectionStatus] = useState("connecting");

  // Configuration for WebRTC
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
  };

  // Initialize local media
  const initializeMedia = useCallback(async () => {
    try {
      console.log("Initializing media...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 2,
        },
      });

      console.log("Media obtained successfully");
      setLocalStream(stream);
      setConnectionStatus("connected");

      // Enable tracks by default
      stream.getVideoTracks()[0].enabled = isVideoEnabled;
      stream.getAudioTracks()[0].enabled = isAudioEnabled;

      return stream;
    } catch (error) {
      console.error("Media initialization error:", error);
      toast.error(
        "Failed to access camera/microphone. Please check permissions."
      );

      // Create a dummy stream for testing
      const dummyCanvas = document.createElement("canvas");
      dummyCanvas.width = 640;
      dummyCanvas.height = 480;
      const ctx = dummyCanvas.getContext("2d");
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Camera Off", 320, 240);

      const dummyStream = dummyCanvas.captureStream();
      setLocalStream(dummyStream);
      setConnectionStatus("no-media");

      return dummyStream;
    }
  }, [isVideoEnabled, isAudioEnabled]);

  // Create a new peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      console.log(`Creating peer connection for: ${targetUserId}`);

      try {
        const pc = new RTCPeerConnection(configuration);
        const connectionId = `${userId.current}_${targetUserId}`;

        // Add local tracks if available
        if (localStream) {
          localStream.getTracks().forEach((track) => {
            if (track.kind === "video" && !isVideoEnabled) return;
            if (track.kind === "audio" && !isAudioEnabled) return;

            try {
              pc.addTrack(track, localStream);
              console.log(`Added ${track.kind} track to peer connection`);
            } catch (err) {
              console.error("Error adding track:", err);
            }
          });
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
          console.log(
            `Received remote track from ${targetUserId}:`,
            event.track.kind
          );

          if (event.streams && event.streams[0]) {
            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, event.streams[0]);
              return newMap;
            });

            // Update participant video status
            setParticipants((prev) =>
              prev.map((p) =>
                p.userId === targetUserId
                  ? { ...p, hasVideo: true, connectionId }
                  : p
              )
            );
          }
        };

        // ICE candidate handling
        pc.onicecandidate = (event) => {
          if (event.candidate && socket && socket.connected) {
            console.log(`Sending ICE candidate to ${targetUserId}`);
            socket.emit("ice-candidate", {
              candidate: event.candidate,
              to: targetUserId,
              from: userId.current,
            });
          }
        };

        // Connection state changes
        pc.oniceconnectionstatechange = () => {
          console.log(
            `ICE connection state with ${targetUserId}:`,
            pc.iceConnectionState
          );

          if (
            pc.iceConnectionState === "failed" ||
            pc.iceConnectionState === "disconnected"
          ) {
            console.log(`Attempting to restart ICE with ${targetUserId}`);
            // Try to restart ICE
            pc.restartIce();
          }

          if (pc.iceConnectionState === "connected") {
            console.log(`Successfully connected to ${targetUserId}`);
            setConnectionStatus("connected");
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(
            `Connection state with ${targetUserId}:`,
            pc.connectionState
          );
        };

        pc.onsignalingstatechange = () => {
          console.log(
            `Signaling state with ${targetUserId}:`,
            pc.signalingState
          );
        };

        // Store the connection
        setPeerConnections((prev) => {
          const newMap = new Map(prev);
          newMap.set(targetUserId, pc);
          return newMap;
        });

        return pc;
      } catch (error) {
        console.error("Error creating peer connection:", error);
        return null;
      }
    },
    [localStream, isVideoEnabled, isAudioEnabled, socket]
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
      console.log("Joining room:", {
        roomId,
        userId: userId.current,
        userName,
      });
      socket.emit("join-room", {
        roomId,
        userId: userId.current,
        userName,
      });

      // Set up socket event handlers
      const handlers = {
        "room-joined": ({ participants: existingParticipants }) => {
          console.log(
            "Room joined, existing participants:",
            existingParticipants
          );
          setParticipants(existingParticipants);

          // Create peer connections for existing participants
          existingParticipants.forEach(async (participant) => {
            if (participant.userId !== userId.current) {
              console.log(
                `Creating connection for existing participant: ${participant.userId}`
              );
              const pc = createPeerConnection(participant.userId);

              if (pc) {
                try {
                  // Create and send offer
                  const offer = await pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                  });

                  await pc.setLocalDescription(offer);

                  socket.emit("offer", {
                    offer: pc.localDescription,
                    to: participant.userId,
                    from: userId.current,
                  });

                  console.log(`Sent offer to ${participant.userId}`);
                } catch (error) {
                  console.error("Error creating offer:", error);
                }
              }
            }
          });
        },

        "user-joined": (participant) => {
          console.log("New user joined:", participant);
          if (participant.userId !== userId.current) {
            setParticipants((prev) => [...prev, participant]);

            // Create peer connection for new user
            const pc = createPeerConnection(participant.userId);

            if (pc) {
              // We'll wait for them to send us an offer
              console.log(`Waiting for offer from ${participant.userId}`);
            }
          }
        },

        "user-left": ({ userId: leftUserId }) => {
          console.log("User left:", leftUserId);
          setParticipants((prev) =>
            prev.filter((p) => p.userId !== leftUserId)
          );

          // Clean up peer connection
          setPeerConnections((prev) => {
            const newMap = new Map(prev);
            const pc = newMap.get(leftUserId);
            if (pc) {
              pc.close();
            }
            newMap.delete(leftUserId);
            return newMap;
          });

          // Remove remote stream
          setRemoteStreams((prev) => {
            const newMap = new Map(prev);
            newMap.delete(leftUserId);
            return newMap;
          });
        },

        offer: async ({ offer, from }) => {
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

            console.log(`Sent answer to ${from}`);
          } catch (error) {
            console.error("Error handling offer:", error);
          }
        },

        answer: async ({ answer, from }) => {
          console.log(`Received answer from ${from}`);
          const pc = peerConnections.get(from);

          if (pc) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              console.log(`Set remote description from ${from}`);
            } catch (error) {
              console.error("Error handling answer:", error);
            }
          }
        },

        "ice-candidate": async ({ candidate, from }) => {
          console.log(`Received ICE candidate from ${from}`);
          const pc = peerConnections.get(from);

          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`Added ICE candidate from ${from}`);
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

      // Attach all handlers
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.on(event, handler);
      });

      // Cleanup function
      return () => {
        console.log("Cleaning up room...");
        Object.keys(handlers).forEach((event) => {
          socket.off(event);
        });

        // Leave room
        socket.emit("leave-room", { roomId, userId: userId.current });

        // Close all peer connections
        peerConnections.forEach((pc) => {
          if (pc) pc.close();
        });

        // Stop local stream
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
      };
    };

    setupRoom();
  }, [socket, isConnected, roomId, userName, navigate, createPeerConnection]);

  // Control functions
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);

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
          enabled: videoTrack.enabled,
        });

        toast.success(videoTrack.enabled ? "Video enabled" : "Video disabled");
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);

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
          enabled: audioTrack.enabled,
        });

        toast.success(audioTrack.enabled ? "Audio enabled" : "Audio muted");
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all peer connections
        peerConnections.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Handle screen share stop
        screenTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
        socket.emit("start-screen-share", { roomId, userId: userId.current });
        toast.success("Screen sharing started");
      } else {
        // Stop screen sharing - restore camera
        if (localStream) {
          const cameraTrack = localStream.getVideoTracks()[0];

          // Replace screen track with camera track
          peerConnections.forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (sender && cameraTrack) {
              sender.replaceTrack(cameraTrack);
            }
          });

          setIsScreenSharing(false);
          socket.emit("stop-screen-share", { roomId, userId: userId.current });
          toast.success("Screen sharing stopped");
        }
      }
    } catch (error) {
      console.error("Screen share error:", error);
      if (error.name !== "NotAllowedError") {
        toast.error("Failed to share screen");
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
    toast.success("Room ID copied to clipboard!");
  };

  const leaveRoom = () => {
    navigate("/");
    toast("Left the meeting", { icon: "👋" });
  };

  // Mobile responsive layout
  const isMobile = window.innerWidth < 768;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Mobile Top Bar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-b border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary-500" />
              <span className="font-medium text-white truncate max-w-[120px]">
                {roomId}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400">
                {participants.length + 1} online
              </span>
              <button
                onClick={leaveRoom}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <header className="bg-gray-900/80 backdrop-blur-lg border-b border-gray-800">
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
                        <span>{participants.length + 1} participants</span>
                      </span>
                      <span>•</span>
                      <span>Room: {roomId}</span>
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
      )}

      <main className={`${isMobile ? "pt-16 pb-24" : "py-6"}`}>
        <div
          className={`${
            isMobile ? "px-2" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
          }`}
        >
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

              {!isMobile && (
                <ControlBar
                  isVideoEnabled={isVideoEnabled}
                  isAudioEnabled={isAudioEnabled}
                  isScreenSharing={isScreenSharing}
                  onToggleVideo={toggleVideo}
                  onToggleAudio={toggleAudio}
                  onToggleScreenShare={toggleScreenShare}
                  onLeaveRoom={leaveRoom}
                />
              )}
            </div>

            {/* Side Panels (Desktop) */}
            {!isMobile && (showChat || showParticipants) && (
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
            )}
          </div>
        </div>
      </main>

      {/* Mobile Control Bar */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 p-3 z-50">
          <div className="flex items-center justify-around">
            <button
              onClick={toggleVideo}
              className={`flex flex-col items-center p-3 rounded-lg transition ${
                isVideoEnabled ? "bg-gray-800" : "bg-red-600"
              }`}
            >
              <div
                className={`h-5 w-5 ${
                  isVideoEnabled ? "text-green-400" : "text-white"
                }`}
              >
                {isVideoEnabled ? "📹" : "📷"}
              </div>
              <span className="text-xs mt-1 text-gray-300">
                {isVideoEnabled ? "Video" : "Off"}
              </span>
            </button>

            <button
              onClick={toggleAudio}
              className={`flex flex-col items-center p-3 rounded-lg transition ${
                isAudioEnabled ? "bg-gray-800" : "bg-red-600"
              }`}
            >
              <div
                className={`h-5 w-5 ${
                  isAudioEnabled ? "text-green-400" : "text-white"
                }`}
              >
                {isAudioEnabled ? "🎤" : "🔇"}
              </div>
              <span className="text-xs mt-1 text-gray-300">
                {isAudioEnabled ? "Mic" : "Muted"}
              </span>
            </button>

            <button
              onClick={() => setShowChat(!showChat)}
              className="flex flex-col items-center p-3 rounded-lg bg-gray-800 transition"
            >
              <MessageSquare className="h-5 w-5 text-blue-400" />
              <span className="text-xs mt-1 text-gray-300">Chat</span>
            </button>

            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="flex flex-col items-center p-3 rounded-lg bg-gray-800 transition"
            >
              <Users className="h-5 w-5 text-purple-400" />
              <span className="text-xs mt-1 text-gray-300">People</span>
            </button>

            <button
              onClick={leaveRoom}
              className="flex flex-col items-center p-3 rounded-lg bg-red-600 transition"
            >
              <div className="h-5 w-5 text-white">🚪</div>
              <span className="text-xs mt-1 text-white">Leave</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Side Panels (Overlay) */}
      {isMobile && (showChat || showParticipants) && (
        <div className="fixed inset-0 bg-gray-900/95 backdrop-blur-lg z-40 pt-16">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">
                {showChat ? "Chat" : "Participants"}
              </h3>
              <button
                onClick={() => {
                  setShowChat(false);
                  setShowParticipants(false);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {showChat && (
                <ChatPanel
                  messages={messages}
                  onSendMessage={sendMessage}
                  currentUserId={userId.current}
                  mobile={true}
                />
              )}

              {showParticipants && (
                <ParticipantsPanel
                  participants={participants}
                  currentUser={{ userId: userId.current, userName }}
                  mobile={true}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connection Status Overlay */}
      {connectionStatus !== "connected" && (
        <div className="fixed inset-0 bg-gray-950/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-8 max-w-md mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/10 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {connectionStatus === "connecting"
                ? "Connecting..."
                : "Media Access Required"}
            </h3>
            <p className="text-gray-400 mb-6">
              {connectionStatus === "connecting"
                ? "Establishing secure connection with other participants..."
                : "Please allow camera and microphone access to join the meeting."}
            </p>
            {connectionStatus === "no-media" && (
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
              >
                Grant Permissions
              </button>
            )}
            <div className="mt-6 text-sm text-gray-500">
              Room ID:{" "}
              <span className="font-mono text-primary-400">{roomId}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
