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

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      return mobile;
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("resize", checkMobile);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Initialize media with better error handling
  const initializeMedia = useCallback(async () => {
    if (localStream) {
      console.log("Media already initialized");
      return localStream;
    }

    try {
      console.log("Requesting media permissions...");
      setConnectionStatus("requesting-media");

      // First check if we have any video/audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevices = devices.some(
        (device) => device.kind === "videoinput"
      );
      const hasAudioDevices = devices.some(
        (device) => device.kind === "audioinput"
      );

      console.log("Available devices:", { hasVideoDevices, hasAudioDevices });

      // Prepare constraints based on available devices
      const constraints = {
        video: hasVideoDevices
          ? {
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
              frameRate: { ideal: 30 },
              facingMode: "user",
              ...(isMobile && {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
              }),
            }
          : false,

        audio: hasAudioDevices
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              ...(isMobile && {
                sampleRate: 16000,
                channelCount: 1,
              }),
            }
          : false,
      };

      console.log("Media constraints:", constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Media stream obtained:", {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Check what we actually got
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      // Enable tracks based on user preference
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
        console.log("Video track enabled:", videoTrack.enabled);
      }
      if (audioTrack) {
        audioTrack.enabled = isAudioEnabled;
        console.log("Audio track enabled:", audioTrack.enabled);
      }

      setLocalStream(stream);
      setConnectionStatus("connected");

      toast.success("Camera and microphone ready!");
      return stream;
    } catch (error) {
      console.error("Media access error:", error.name, error.message);

      // Handle specific errors
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        toast.error(
          "Please allow camera and microphone access in browser settings"
        );
        setConnectionStatus("permission-denied");
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        toast.error("No camera or microphone detected");
        setConnectionStatus("no-devices");
      } else if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        toast.error("Device is already in use by another application");
        setConnectionStatus("device-busy");
      } else if (error.name === "OverconstrainedError") {
        toast.error("Requested camera settings not supported");
        setConnectionStatus("constraint-error");
      } else {
        toast.error("Failed to access media devices");
        setConnectionStatus("error");
      }

      // Create placeholder stream to continue
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#3b82f6";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(hasCameraAccess ? "Camera Off" : "No Camera", 320, 240);

      const placeholderStream = canvas.captureStream(1);
      setLocalStream(placeholderStream);
      setConnectionStatus("connected-no-media");

      return placeholderStream;
    }
  }, [localStream, isVideoEnabled, isAudioEnabled, isMobile]);

  // Create peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          existingPc.close();
        }

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });

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

    const setupRoom = async () => {
      if (!socket || !isConnected) {
        console.log("Waiting for socket connection...");
        return;
      }

      try {
        // Step 1: Initialize media
        await initializeMedia();
        if (!isMounted) return;

        // Step 2: Join room
        console.log("Joining room:", roomId);
        socket.emit("join-room", {
          roomId,
          userId: userId.current,
          userName,
        });

        // Step 3: Setup socket event handlers
        const handlers = {
          "room-joined": ({ participants: existingParticipants }) => {
            if (!isMounted) return;

            console.log(
              "Room joined, existing participants:",
              existingParticipants
            );
            setParticipants(existingParticipants);

            // Create connections with existing participants
            existingParticipants.forEach((participant, index) => {
              if (participant.userId !== userId.current) {
                setTimeout(() => {
                  if (!isMounted) return;
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
                }, index * 500);
              }
            });
          },

          "user-joined": (participant) => {
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
          },

          "user-left": ({ userId: leftUserId }) => {
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
          },

          offer: async ({ offer, from }) => {
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
          },

          answer: async ({ answer, from }) => {
            const pc = peerConnections.get(from);
            if (pc) {
              try {
                await pc.setRemoteDescription(
                  new RTCSessionDescription(answer)
                );
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
            if (isMounted) {
              setMessages((prev) => [...prev, message]);
            }
          },
        };

        // Attach all handlers
        Object.entries(handlers).forEach(([event, handler]) => {
          socket.on(event, handler);
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
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
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
  const toggleVideo = async () => {
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
      } else if (!hasCameraAccess) {
        toast.error("No camera available on this device");
      }
    }
  };

  const toggleAudio = async () => {
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
      } else if (!hasMicAccess) {
        toast.error("No microphone available on this device");
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
            <p className="text-gray-400">
              Requesting camera and microphone access...
            </p>
            <p className="text-sm text-gray-500">
              Please allow permissions in the browser popup
            </p>
          </div>
          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
            <button
              onClick={leaveRoom}
              className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition"
            >
              Cancel
            </button>
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
          />

          {/* Mobile Status Bar */}
          <div className="mt-4 p-3 bg-gray-900/80 rounded-lg border border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded ${
                    hasCameraAccess ? "bg-green-500/20" : "bg-red-500/20"
                  }`}
                >
                  {hasCameraAccess ? (
                    <Video
                      className={`h-4 w-4 ${
                        isVideoEnabled ? "text-green-400" : "text-red-400"
                      }`}
                    />
                  ) : (
                    <CameraOff className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div
                  className={`p-2 rounded ${
                    hasMicAccess ? "bg-green-500/20" : "bg-red-500/20"
                  }`}
                >
                  {hasMicAccess ? (
                    <Mic
                      className={`h-4 w-4 ${
                        isAudioEnabled ? "text-green-400" : "text-red-400"
                      }`}
                    />
                  ) : (
                    <MicOff className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <p className="text-sm font-medium">
                    {connectionStatus === "connected"
                      ? "Connected"
                      : "Connecting..."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowChat(!showChat)}
                className="p-2 bg-primary-600 rounded-lg"
                title="Chat"
              >
                <MessageSquare className="h-4 w-4" />
                {messages.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {messages.length}
                  </span>
                )}
              </button>
            </div>
          </div>
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
                  <CameraOff className="h-5 w-5 text-white" />
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
                    {!hasCameraAccess && (
                      <span className="text-yellow-500 flex items-center space-x-1">
                        <CameraOff className="h-3 w-3" />
                        <span>No Camera</span>
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
            />

            <ControlBar
              isVideoEnabled={isVideoEnabled && hasCameraAccess}
              isAudioEnabled={isAudioEnabled && hasMicAccess}
              isScreenSharing={isScreenSharing}
              onToggleVideo={toggleVideo}
              onToggleAudio={toggleAudio}
              onToggleScreenShare={() =>
                toast.info("Screen sharing coming soon")
              }
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
