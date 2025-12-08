import React from "react";
import { useNavigate } from "react-router-dom";
import { Home, AlertCircle, ArrowLeft, Video, Users } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

const NotFoundPage = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate("/");
    toast.success("Returned to homepage");
  };

  const handleCreateRoom = () => {
    navigate("/");
    setTimeout(() => {
      toast.success("Redirected to create room page");
    }, 300);
  };

  const handleJoinRoom = () => {
    navigate("/");
    setTimeout(() => {
      toast.success("Redirected to join room page");
    }, 300);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 text-white overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-500/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              y: [null, -20, 20, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Error Illustration */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              <div className="relative mb-8">
                <div className="relative inline-block">
                  {/* Main Error Icon */}
                  <motion.div
                    animate={{
                      rotate: [0, 10, -10, 0],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="w-48 h-48 mx-auto lg:mx-0 bg-gradient-to-br from-red-500/10 to-purple-500/10 rounded-full flex items-center justify-center"
                  >
                    <AlertCircle className="h-32 w-32 text-red-400" />
                  </motion.div>

                  {/* Floating Elements */}
                  <motion.div
                    animate={{
                      y: [0, -20, 0],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute -top-4 -right-4 w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center"
                  >
                    <div className="w-8 h-8 bg-blue-400/30 rounded-full" />
                  </motion.div>

                  <motion.div
                    animate={{
                      y: [0, 20, 0],
                    }}
                    transition={{
                      duration: 3.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 0.5,
                    }}
                    className="absolute -bottom-4 -left-4 w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center"
                  >
                    <div className="w-6 h-6 bg-purple-400/30 rounded-full" />
                  </motion.div>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-8xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-red-500 bg-clip-text text-transparent">
                  404
                </h1>
                <div className="mt-6 space-y-4">
                  <h2 className="text-4xl font-bold text-white">
                    Page Not Found
                  </h2>
                  <p className="text-gray-400 text-lg max-w-md">
                    The conference room you're looking for doesn't exist or has
                    ended. Start a new meeting or join an existing one.
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Right Column - Actions & Info */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="space-y-8"
            >
              <div className="bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
                <h3 className="text-2xl font-bold text-white mb-6">
                  What would you like to do?
                </h3>

                <div className="space-y-4">
                  {/* Primary Action */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGoHome}
                    className="w-full flex items-center justify-between p-6 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 rounded-xl transition-all duration-200 group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-white/10 rounded-lg">
                        <Home className="h-6 w-6 text-white" />
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-white">
                          Return to Home
                        </div>
                        <div className="text-sm text-primary-200">
                          Go back to the main dashboard
                        </div>
                      </div>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-white transform rotate-180 group-hover:translate-x-1 transition-transform" />
                  </motion.button>

                  {/* Secondary Actions */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCreateRoom}
                      className="p-5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-all duration-200 group"
                    >
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="p-3 bg-primary-500/10 rounded-lg">
                          <Video className="h-6 w-6 text-primary-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            Create Room
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Start a new video conference
                          </div>
                        </div>
                      </div>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleJoinRoom}
                      className="p-5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-all duration-200 group"
                    >
                      <div className="flex flex-col items-center text-center space-y-3">
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                          <Users className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            Join Room
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Enter an existing meeting
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  </div>
                </div>

                {/* Help Section */}
                <div className="mt-8 pt-8 border-t border-gray-800">
                  <h4 className="font-semibold text-white mb-4">Need help?</h4>
                  <div className="space-y-3 text-sm text-gray-400">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                      <span>Check if the room ID is correct</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                      <span>Make sure you're connected to the internet</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
                      <span>Contact support if the issue persists</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status & Info */}
              <div className="bg-gray-900/30 backdrop-blur-lg border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-400">Service Status</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-green-400 font-medium">
                      All Systems Operational
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <span className="text-gray-500">Video Quality</span>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full w-4/5 bg-green-500 rounded-full" />
                      </div>
                      <span className="text-green-400">HD</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-gray-500">Audio Quality</span>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full w-full bg-green-500 rounded-full" />
                      </div>
                      <span className="text-green-400">Crystal Clear</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-6 border-t border-gray-800/50">
                <p className="text-gray-500 text-sm">
                  <span className="text-primary-400 font-semibold">
                    ProConference
                  </span>{" "}
                  • Premium Video Conferencing
                </p>
                <p className="text-gray-600 text-xs mt-2">
                  Secure • Reliable • Enterprise-Grade
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-gray-900 to-transparent pointer-events-none" />

      {/* Floating Conference Icons */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute top-1/4 left-1/4 opacity-10"
      >
        <Video className="h-24 w-24 text-blue-400" />
      </motion.div>

      <motion.div
        animate={{
          x: [0, -80, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
          delay: 5,
        }}
        className="absolute bottom-1/4 right-1/4 opacity-10"
      >
        <Users className="h-20 w-20 text-green-400" />
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
