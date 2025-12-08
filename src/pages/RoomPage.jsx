import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useSocket } from "../contexts/SocketContext";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";
import { Copy, Shield, Users, MessageSquare, X } from "lucide-react";
import toast from "react-hot-toast";

const RoomPage = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const userName = searchParams.get("name") || "Anonymous";
  const userId = useRef(Math.random().toString(36).substr(2, 9));

  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerConnections, setPeerConnections] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [roomFull, setRoomFull] = useState(false);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  };

  // Initialize local media
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setLocalStream(stream);
    } catch (error) {
      toast.error("Failed to access camera/microphone");
      console.error("Media error:", error);
    }
  }, []);

  // WebRTC Peer Connection
  const createPeerConnection = useCallback(
    (targetUserId) => {
      const pc = new RTCPeerConnection(configuration);

      // Add local stream tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        setRemoteStreams((prev) => ({
          ...prev,
          [targetUserId]: event.streams[0],
        }));
      };

      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            to: targetUserId,
            from: userId.current,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `Connection state with ${targetUserId}:`,
          pc.connectionState
        );
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state with ${targetUserId}:`,
          pc.iceConnectionState
        );
      };

      return pc;
    },
    [localStream, socket]
  );

  // Join room
  useEffect(() => {
    if (!socket || !localStream) return;

    socket.emit("join-room", {
      roomId,
      userId: userId.current,
      userName,
    });

    socket.on("room-joined", ({ participants: existingParticipants }) => {
      setParticipants(existingParticipants);

      // Create peer connections for existing participants
      existingParticipants.forEach((participant) => {
        const pc = createPeerConnection(participant.userId);
        setPeerConnections((prev) => ({ ...prev, [participant.userId]: pc }));

        // Create offer for existing participant
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socket.emit("offer", {
              offer: pc.localDescription,
              to: participant.userId,
              from: userId.current,
            });
          })
          .catch((error) => console.error("Create offer error:", error));
      });
    });

    socket.on("user-joined", (participant) => {
      setParticipants((prev) => [...prev, participant]);

      // Create peer connection for new participant
      const pc = createPeerConnection(participant.userId);
      setPeerConnections((prev) => ({ ...prev, [participant.userId]: pc }));
    });

    socket.on("user-left", ({ userId: leftUserId }) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== leftUserId));
      setRemoteStreams((prev) => {
        const newStreams = { ...prev };
        delete newStreams[leftUserId];
        return newStreams;
      });
      setPeerConnections((prev) => {
        const newPCs = { ...prev };
        if (newPCs[leftUserId]) {
          newPCs[leftUserId].close();
          delete newPCs[leftUserId];
        }
        return newPCs;
      });
    });

    socket.on("offer", async ({ offer, from }) => {
      console.log("Received offer from:", from);

      let pc = peerConnections[from];
      if (!pc) {
        pc = createPeerConnection(from);
        setPeerConnections((prev) => ({ ...prev, [from]: pc }));
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          answer,
          to: from,
          from: userId.current,
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    });

    socket.on("answer", async ({ answer, from }) => {
      console.log("Received answer from:", from);
      const pc = peerConnections[from];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = peerConnections[from];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    });

    socket.on("new-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on("room-error", ({ message }) => {
      if (message === "Room is full") {
        setRoomFull(true);
        toast.error("Room is full! Maximum 10 participants allowed.");
        setTimeout(() => navigate("/"), 2000);
      }
    });

    socket.on("video-toggled", ({ userId: targetUserId, enabled }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === targetUserId ? { ...p, videoEnabled: enabled } : p
        )
      );
    });

    socket.on("audio-toggled", ({ userId: targetUserId, enabled }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === targetUserId ? { ...p, audioEnabled: enabled } : p
        )
      );
    });

    return () => {
      socket.emit("leave-room", { roomId, userId: userId.current });
    };
  }, [socket, localStream, roomId, userName, createPeerConnection, navigate]);

  // Initialize media on mount
  useEffect(() => {
    initializeMedia();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      Object.values(peerConnections).forEach((pc) => pc?.close());
    };
  }, []);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        socket.emit("toggle-video", {
          roomId,
          userId: userId.current,
          enabled: videoTrack.enabled,
        });
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        socket.emit("toggle-audio", {
          roomId,
          userId: userId.current,
          enabled: audioTrack.enabled,
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            displaySurface: "monitor",
          },
          audio: true,
        });

        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        Object.values(peerConnections).forEach((pc) => {
          const sender = pc
            ?.getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });

        // Update local stream
        const newStream = new MediaStream([
          videoTrack,
          ...localStream.getAudioTracks(),
        ]);
        setLocalStream(newStream);

        setIsScreenSharing(true);
        socket.emit("start-screen-share", { roomId, userId: userId.current });

        // Handle screen share stop
        videoTrack.onended = () => {
          toggleScreenShare();
        };
      } else {
        // Restore camera track
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const videoTrack = cameraStream.getVideoTracks()[0];

        // Replace screen track with camera track
        Object.values(peerConnections).forEach((pc) => {
          const sender = pc
            ?.getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });

        // Update local stream
        const newStream = new MediaStream([
          videoTrack,
          ...localStream.getAudioTracks(),
        ]);
        setLocalStream(newStream);

        setIsScreenSharing(false);
        socket.emit("stop-screen-share", { roomId, userId: userId.current });
      }
    } catch (error) {
      console.error("Screen share error:", error);
      toast.error("Failed to share screen");
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
  };

  if (roomFull) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
            <Users className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Room is Full</h2>
          <p className="text-gray-400">Maximum 10 participants allowed</p>
        </div>
      </div>
    );
  }

  if (!localStream) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-gray-300">Initializing media...</p>
          <p className="text-sm text-gray-500">
            Please allow camera and microphone access
          </p>
        </div>
      </div>
    );
  }

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
                  <h1 className="text-xl font-bold text-white">
                    ProConference
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
              isScreenSharing={isScreenSharing}
            />

            <ControlBar
              isVideoEnabled={isVideoEnabled}
              isAudioEnabled={isAudioEnabled}
              isScreenSharing={isScreenSharing}
              onToggleVideo={toggleVideo}
              onToggleAudio={toggleAudio}
              onToggleScreenShare={toggleScreenShare}
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
      </main>
    </div>
  );
};

export default RoomPage;
