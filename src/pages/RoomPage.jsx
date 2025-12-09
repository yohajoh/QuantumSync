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
  Video,
  VideoOff,
  Mic,
  MicOff,
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
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Start with false for mobile
  const [isAudioEnabled, setIsAudioEnabled] = useState(false); // Start with false for mobile
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("initializing");
  const [hasMediaPermission, setHasMediaPermission] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      return mobile;
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Configuration for WebRTC
  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.iptel.org" },
      { urls: "stun:stun.voiparound.com" },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  // Initialize media with proper mobile handling
  const initializeMedia = useCallback(
    async (forceRequest = false) => {
      try {
        console.log("Initializing media...");
        setConnectionStatus("requesting-permission");

        // Check if we already have permission on mobile
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(
          (device) => device.kind === "videoinput" && device.label
        );
        const hasMic = devices.some(
          (device) => device.kind === "audioinput" && device.label
        );

        // For mobile, only request permissions after user action
        if (isMobile && !forceRequest && (!hasCamera || !hasMic)) {
          setConnectionStatus("awaiting-user-action");
          return null;
        }

        // Create constraints based on device
        const constraints = {
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: "user",
            // Mobile-specific constraints
            ...(isMobile && {
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 24, max: 30 },
            }),
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // Mobile-specific audio settings
            ...(isMobile && {
              sampleSize: 16,
              channelCount: 1,
            }),
          },
        };

        // Request media
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log("Media obtained successfully");
        setLocalStream(stream);
        setHasMediaPermission(true);
        setConnectionStatus("connected");

        // Enable tracks based on user preference
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (videoTrack) {
          videoTrack.enabled = isVideoEnabled;
        }
        if (audioTrack) {
          audioTrack.enabled = isAudioEnabled;
        }

        return stream;
      } catch (error) {
        console.error("Media initialization error:", error);

        // Handle specific errors
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        ) {
          toast.error("Please allow camera and microphone access");
          setConnectionStatus("permission-denied");
        } else if (
          error.name === "NotFoundError" ||
          error.name === "DevicesNotFoundError"
        ) {
          toast.error("No camera or microphone found");
          setConnectionStatus("no-devices");
        } else if (
          error.name === "NotReadableError" ||
          error.name === "TrackStartError"
        ) {
          toast.error("Camera or microphone is already in use");
          setConnectionStatus("device-busy");
        } else {
          toast.error("Failed to access media devices");
          setConnectionStatus("error");
        }

        return null;
      }
    },
    [isMobile, isVideoEnabled, isAudioEnabled]
  );

  // Create a clean peer connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      console.log(`Creating peer connection for: ${targetUserId}`);

      try {
        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Add local tracks if available and enabled
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          const audioTrack = localStream.getAudioTracks()[0];

          if (videoTrack && isVideoEnabled) {
            try {
              pc.addTrack(videoTrack, localStream);
              console.log("Added video track to peer connection");
            } catch (err) {
              console.error("Error adding video track:", err);
            }
          }

          if (audioTrack && isAudioEnabled) {
            try {
              pc.addTrack(audioTrack, localStream);
              console.log("Added audio track to peer connection");
            } catch (err) {
              console.error("Error adding audio track:", err);
            }
          }
        }

        // Handle remote tracks - CRITICAL FIX for "vibrating" issue
        let remoteStream = null;
        pc.ontrack = (event) => {
          console.log(
            `Received remote track from ${targetUserId}:`,
            event.track.kind
          );

          if (event.streams && event.streams[0]) {
            // Use the first stream and don't create new ones
            if (!remoteStream) {
              remoteStream = event.streams[0];
              setRemoteStreams((prev) => {
                const newMap = new Map(prev);
                newMap.set(targetUserId, remoteStream);
                return newMap;
              });
            }

            // Add track to existing stream
            if (
              !remoteStream.getTracks().some((t) => t.id === event.track.id)
            ) {
              remoteStream.addTrack(event.track);
            }
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
            setTimeout(() => {
              if (pc.iceConnectionState === "failed") {
                pc.restartIce();
              }
            }, 1000);
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
    [localStream, isVideoEnabled, isAudioEnabled, socket, peerConnections]
  );

  // Request permissions for mobile
  const requestMediaPermissions = async () => {
    setConnectionStatus("requesting-permission");
    const stream = await initializeMedia(true);

    if (stream) {
      // Auto-enable video and audio after permission granted
      setIsVideoEnabled(true);
      setIsAudioEnabled(true);

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) videoTrack.enabled = true;
      if (audioTrack) audioTrack.enabled = true;

      toast.success("Camera and microphone access granted!");
    }
  };

  // Initialize and join room
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log("Socket not connected yet");
      return;
    }

    const setupRoom = async () => {
      console.log("Setting up room...");

      // Join room first (without media for mobile)
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

              if (pc && localStream) {
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

            if (pc && localStream) {
              // Send offer to new user
              setTimeout(async () => {
                try {
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
                } catch (error) {
                  console.error("Error sending offer to new user:", error);
                }
              }, 1000);
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
          localStream.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
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
    createPeerConnection,
    localStream,
    peerConnections,
  ]);

  // Control functions - FIXED for mobile
  const toggleVideo = async () => {
    if (!localStream && !hasMediaPermission) {
      await requestMediaPermissions();
      return;
    }

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
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
      } else {
        // No video track, need to request camera
        await requestMediaPermissions();
      }
    }
  };

  const toggleAudio = async () => {
    if (!localStream && !hasMediaPermission) {
      await requestMediaPermissions();
      return;
    }

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
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

          if (cameraTrack) {
            // Replace screen track with camera track
            peerConnections.forEach((pc) => {
              const sender = pc
                .getSenders()
                .find((s) => s.track?.kind === "video");
              if (sender && cameraTrack) {
                sender.replaceTrack(cameraTrack);
              }
            });
          }

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

  // Render permission request UI for mobile
  if (
    isMobile &&
    !hasMediaPermission &&
    connectionStatus === "awaiting-user-action"
  ) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900/90 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-primary-500/10 rounded-full flex items-center justify-center">
            <Video className="h-10 w-10 text-primary-400" />
          </div>

          <h1 className="text-2xl font-bold mb-4">
            Camera & Microphone Access
          </h1>

          <p className="text-gray-400 mb-6">
            QuantumSync needs access to your camera and microphone for video
            calls. Please allow permissions when prompted.
          </p>

          <div className="space-y-4">
            <button
              onClick={requestMediaPermissions}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
            >
              Allow Camera & Microphone
            </button>

            <button
              onClick={() => {
                setIsVideoEnabled(false);
                setIsAudioEnabled(false);
                setHasMediaPermission(true);
                setConnectionStatus("connected");
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

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Room: <span className="font-mono text-primary-400">{roomId}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Connection Status Overlay */}
      {connectionStatus !== "connected" &&
        connectionStatus !== "awaiting-user-action" && (
          <div className="fixed inset-0 bg-gray-950/90 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-8 max-w-md mx-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-500/10 rounded-full flex items-center justify-center">
                {connectionStatus === "requesting-permission" ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                ) : (
                  <AlertCircle className="h-8 w-8 text-blue-400" />
                )}
              </div>

              <h3 className="text-xl font-bold text-white mb-2">
                {connectionStatus === "requesting-permission"
                  ? "Requesting Permissions..."
                  : connectionStatus === "permission-denied"
                  ? "Permissions Required"
                  : connectionStatus === "initializing"
                  ? "Initializing..."
                  : "Connection Issue"}
              </h3>

              <p className="text-gray-400 mb-6">
                {connectionStatus === "requesting-permission"
                  ? "Please allow camera and microphone access in the browser prompt."
                  : connectionStatus === "permission-denied"
                  ? "Camera and microphone access is required for video calls."
                  : "Establishing connection with other participants..."}
              </p>

              {connectionStatus === "permission-denied" && (
                <button
                  onClick={requestMediaPermissions}
                  className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium transition"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}

      {/* Rest of your UI remains the same */}
      {/* ... keep your existing header, main content, control bars, etc. */}
    </div>
  );
};

export default RoomPage;
