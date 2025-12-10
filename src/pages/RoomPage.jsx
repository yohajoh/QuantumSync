import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import VideoGrid from "../components/VideoGrid";
import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";
// ... icons import remains the same

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
  const [connectionStatus, setConnectionStatus] = useState("connecting");
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
  const dataChannelRef = useRef(new Map());

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

  // WebRTC configuration with STUN servers
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

  // Initialize media - FIXED VERSION
  const initializeMedia = useCallback(async () => {
    try {
      setConnectionStatus("requesting-media");
      console.log("🎥 Requesting media permissions...");

      // Stop any existing stream first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
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
      });

      console.log("✅ Media stream obtained successfully");

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      setHasCameraAccess(!!videoTrack);
      setHasMicAccess(!!audioTrack);

      // Enable tracks based on current state
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
        console.log(`Video track enabled: ${videoTrack.enabled}`);
      }
      if (audioTrack) {
        audioTrack.enabled = isAudioEnabled;
        console.log(`Audio track enabled: ${audioTrack.enabled}`);
      }

      // Store stream
      localStreamRef.current = stream;
      setLocalStream(stream);

      setConnectionStatus("connected");
      toast.success("Camera and microphone ready!");

      return stream;
    } catch (error) {
      console.error("❌ Media error:", error);

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

  // Create peer connection - FIXED VERSION
  const createPeerConnection = useCallback(
    (targetUserId) => {
      try {
        console.log(`🔗 Creating peer connection with ${targetUserId}`);

        // Close existing connection if any
        const existingPc = peerConnections.get(targetUserId);
        if (existingPc) {
          console.log(`Closing existing connection with ${targetUserId}`);
          existingPc.close();
        }

        const pc = new RTCPeerConnection(configuration);

        // Store connection immediately
        setPeerConnections((prev) => {
          const newMap = new Map(prev);
          newMap.set(targetUserId, pc);
          return newMap;
        });

        // Add local tracks if available
        if (localStreamRef.current) {
          console.log("Adding local tracks to peer connection");
          localStreamRef.current.getTracks().forEach((track) => {
            try {
              console.log(`Adding ${track.kind} track`);
              pc.addTrack(track, localStreamRef.current);
            } catch (err) {
              console.warn(`Failed to add ${track.kind} track:`, err);
            }
          });
        }

        // Handle remote tracks - FIXED
        pc.ontrack = (event) => {
          console.log(`📹 Received track from ${targetUserId}:`, {
            kind: event.track.kind,
            enabled: event.track.enabled,
            streams: event.streams.length,
          });

          if (event.streams && event.streams[0]) {
            const remoteStream = event.streams[0];

            setRemoteStreams((prev) => {
              const newMap = new Map(prev);
              newMap.set(targetUserId, remoteStream);
              return newMap;
            });

            console.log(`✅ Stream saved for ${targetUserId}`);
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
          console.log(`🌐 ICE state with ${targetUserId}: ${state}`);

          if (state === "connected" || state === "completed") {
            console.log(`✅ Connected to ${targetUserId}`);
            toast.success(`Connected to participant`);
          } else if (state === "failed") {
            console.log(`❌ Connection failed with ${targetUserId}`);
          }
        };

        // Create data channel for messaging
        if (!dataChannelRef.current.has(targetUserId)) {
          const dataChannel = pc.createDataChannel("chat");
          dataChannelRef.current.set(targetUserId, dataChannel);
        }

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

      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      };

      const offer = await pc.createOffer(offerOptions);
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

  // Setup socket - FIXED
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
      if (!isMountedRef.current) return;

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
        const pc = createPeerConnection(participant.userId);
        if (pc) {
          sendOffer(pc, participant.userId);
        }
      }
    };

    const handleUserLeft = ({ userId: leftUserId }) => {
      if (!isMountedRef.current) return;

      console.log(`👋 User left: ${leftUserId}`);
      setParticipants((prev) => prev.filter((p) => p.userId !== leftUserId));

      // Cleanup
      const pc = peerConnections.get(leftUserId);
      if (pc) {
        pc.close();
        setPeerConnections((prev) => {
          const newMap = new Map(prev);
          newMap.delete(leftUserId);
          return newMap;
        });
      }

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

      socket.off("room-joined");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("new-message");

      socket.emit("leave-room", { roomId, userId: userId.current });

      // Close all peer connections
      peerConnections.forEach((pc) => {
        if (pc) pc.close();
      });

      // Stop all media tracks
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

    // Connect to existing participants with delay
    setTimeout(() => {
      console.log(`🔗 Connecting to ${participants.length} participants...`);
      participants.forEach((participant, index) => {
        if (participant.userId !== userId.current) {
          setTimeout(() => {
            const pc = createPeerConnection(participant.userId);
            if (pc) {
              sendOffer(pc, participant.userId);
            }
          }, index * 300);
        }
      });
    }, 500);
  };

  // Control functions - FIXED
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
      peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find(
          (sender) => sender.track && sender.track.kind === "video"
        );
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
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
      peerConnections.forEach((pc) => {
        const senders = pc.getSenders();
        const audioSender = senders.find(
          (sender) => sender.track && sender.track.kind === "audio"
        );
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
        }
      });

      toast.success(newState ? "Audio enabled" : "Audio muted");
    }
  };

  // The rest of the component remains the same...
  // (screen share, fullscreen, copyRoomId, leaveRoom, sendMessage, refreshConnections functions)

  // ... [Rest of the component JSX remains the same]

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

  // Show meeting room (JSX remains the same)
  if (isJoiningMeeting) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Header and main content remains the same */}
        {/* ... */}
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
