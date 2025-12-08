import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  VideoCameraIcon,
  UserGroupIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

const HomePage = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = () => {
    if (!userName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    const newRoomId = uuidv4().slice(0, 8);
    navigate(`/room/${newRoomId}?name=${encodeURIComponent(userName)}`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();

    if (!roomId.trim() || !userName.trim()) {
      toast.error("Please enter both room ID and your name");
      return;
    }

    if (roomId.length < 8) {
      toast.error("Invalid room ID format");
      return;
    }

    navigate(`/room/${roomId}?name=${encodeURIComponent(userName)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-6xl w-full grid md:grid-cols-2 gap-12 items-center">
        {/* Left Column - Hero Section */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <VideoCameraIcon className="h-8 w-8 text-primary-500" />
              </div>
              <h1 className="text-4xl font-bold text-white">
                Pro<span className="text-primary-400">Conference</span>
              </h1>
            </div>

            <h2 className="text-5xl font-bold text-white leading-tight">
              Premium Video
              <span className="block text-primary-300">Conferencing</span>
            </h2>

            <p className="text-gray-300 text-lg">
              Enterprise-grade video conferencing with crystal clear audio,
              screen sharing, and real-time collaboration tools.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <ShieldCheckIcon className="h-5 w-5 text-green-400" />
                <span className="text-gray-300 font-medium">
                  Secure & Encrypted
                </span>
              </div>
              <p className="text-gray-400 text-sm">
                End-to-end encryption for all meetings
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <UserGroupIcon className="h-5 w-5 text-blue-400" />
                <span className="text-gray-300 font-medium">
                  Up to 10 Participants
                </span>
              </div>
              <p className="text-gray-400 text-sm">
                HD video quality for everyone
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-5 w-5 text-purple-400" />
                <span className="text-gray-300 font-medium">
                  24/7 Available
                </span>
              </div>
              <p className="text-gray-400 text-sm">
                No time limits on meetings
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Join/Create Form */}
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 shadow-2xl">
          <div className="space-y-8">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">
                Join a Meeting
              </h3>
              <p className="text-gray-400">
                Enter meeting details to join or create a new room
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                  placeholder="Enter your name"
                  maxLength={30}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Room ID
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                  placeholder="Enter room ID (e.g., ABCD1234)"
                  pattern="[A-Z0-9]{8}"
                  title="8 character room ID"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Ask the meeting host for the Room ID
                </p>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-medium rounded-lg hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200"
              >
                <span>Join Meeting</span>
                <ArrowRightIcon className="h-5 w-5" />
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-800/50 text-gray-400">Or</span>
              </div>
            </div>

            <div>
              <button
                onClick={handleCreateRoom}
                disabled={!userName.trim()}
                className={`w-full px-6 py-3 border-2 border-dashed rounded-lg text-center transition-all duration-200 ${
                  userName.trim()
                    ? "border-primary-500/50 text-primary-400 hover:border-primary-500 hover:bg-primary-500/5 cursor-pointer"
                    : "border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                <div className="flex flex-col items-center space-y-2">
                  <VideoCameraIcon className="h-8 w-8" />
                  <div>
                    <div className="font-medium">Create New Meeting</div>
                    <div className="text-sm">
                      Start an instant conference room
                    </div>
                  </div>
                </div>
              </button>

              {isCreating && (
                <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">Your Room ID:</span>
                    <code className="px-3 py-1 bg-gray-800 rounded text-primary-300 font-mono font-bold">
                      {uuidv4().slice(0, 8)}
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
