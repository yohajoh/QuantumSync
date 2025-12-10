import React, { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Send, Smile, Paperclip, MessageSquare, User } from "lucide-react";

const ChatPanel = ({
  messages,
  onSendMessage,
  currentUserId,
  mobile = false,
}) => {
  const [newMessage, setNewMessage] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle mobile keyboard visibility
  useEffect(() => {
    if (!mobile) return;

    const handleResize = () => {
      const isKeyboard = window.innerHeight < window.outerHeight * 0.9;
      setIsKeyboardVisible(isKeyboard);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobile]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage("");
      if (mobile && inputRef.current) {
        inputRef.current.blur();
      }
    }
  };

  const handleInputFocus = () => {
    if (mobile) {
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  };

  // Calculate time difference for grouping messages
  const shouldGroupMessages = (prevMsg, currentMsg) => {
    if (!prevMsg || prevMsg.userId !== currentMsg.userId) return false;

    const prevTime = new Date(prevMsg.timestamp);
    const currentTime = new Date(currentMsg.timestamp);
    const diffInMinutes = (currentTime - prevTime) / (1000 * 60);

    return diffInMinutes < 2; // Group messages within 2 minutes
  };

  return (
    <div
      className={`${
        mobile
          ? "h-full flex flex-col bg-gray-900"
          : "bg-gray-900/90 backdrop-blur-lg rounded-xl border border-gray-800 flex flex-col h-full max-h-[600px]"
      } ${isKeyboardVisible ? "pb-20" : ""}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Meeting Chat</h3>
              <p className="text-sm text-gray-400">
                {messages.length > 0
                  ? `${messages.length} messages`
                  : "No messages yet"}
              </p>
            </div>
          </div>
          {/* {!mobile && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="p-2 hover:bg-gray-800 rounded-lg transition"
                title="Attach file"
              >
                <Paperclip className="h-5 w-5 text-gray-400" />
              </button>
              <button
                type="button"
                className="p-2 hover:bg-gray-800 rounded-lg transition"
                title="Emoji"
              >
                <Smile className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          )} */}
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto ${mobile ? "p-3" : "p-4"} space-y-4`}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <MessageSquare className="h-10 w-10 text-gray-600" />
            </div>
            <p className="text-gray-400 text-lg mb-2">No messages yet</p>
            <p className="text-sm text-gray-500 max-w-md">
              Start the conversation by sending a message to all participants
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => {
              const isCurrentUser = message.userId === currentUserId;
              const isGrouped =
                index > 0 && shouldGroupMessages(messages[index - 1], message);

              return (
                <div
                  key={index}
                  className={`flex ${
                    isCurrentUser ? "justify-end" : "justify-start"
                  } ${isGrouped ? "mt-1" : "mt-4"}`}
                >
                  <div
                    className={`${
                      mobile ? "max-w-[85%]" : "max-w-[65%]"
                    } rounded-2xl ${
                      isCurrentUser ? "rounded-br-none" : "rounded-bl-none"
                    } ${isCurrentUser ? "bg-primary-600" : "bg-gray-800"} ${
                      isGrouped ? "mt-1" : "p-3"
                    }`}
                    style={
                      isGrouped
                        ? {
                            paddingTop: "4px",
                            paddingBottom: "8px",
                            paddingLeft: isCurrentUser ? "12px" : "12px",
                            paddingRight: isCurrentUser ? "12px" : "12px",
                          }
                        : {}
                    }
                  >
                    {!isGrouped && (
                      <div className="flex items-center space-x-2 mb-2">
                        <div
                          className={`flex items-center space-x-2 ${
                            isCurrentUser ? "justify-end" : ""
                          }`}
                        >
                          {!isCurrentUser && (
                            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
                              <User className="h-3 w-3 text-gray-400" />
                            </div>
                          )}
                          <span
                            className={`text-sm font-medium ${
                              isCurrentUser
                                ? "text-primary-200"
                                : "text-gray-300"
                            }`}
                          >
                            {message.userName}
                          </span>
                          {isCurrentUser && (
                            <div className="w-6 h-6 rounded-full bg-primary-700 flex items-center justify-center">
                              <User className="h-3 w-3 text-primary-300" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {format(new Date(message.timestamp), "HH:mm")}
                        </span>
                      </div>
                    )}

                    <p
                      className={`text-sm ${
                        isCurrentUser ? "text-white" : "text-gray-100"
                      } break-words ${isGrouped ? "ml-8" : ""}`}
                    >
                      {message.message}
                    </p>

                    {isGrouped && !isCurrentUser && (
                      <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center absolute left-2 -top-2">
                        <User className="h-3 w-3 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className={`${
          mobile
            ? "sticky bottom-0 bg-gray-900 border-t border-gray-800"
            : "border-t border-gray-800"
        } p-4`}
      >
        <div className="flex items-center space-x-2">
          {/* {!mobile && (
            // <>
            //   <button
            //     type="button"
            //     className="p-2 hover:bg-gray-800 rounded-lg transition"
            //     title="Attach file"
            //   >
            //     <Paperclip className="h-5 w-5 text-gray-400" />
            //   </button>

            //   <button
            //     type="button"
            //     className="p-2 hover:bg-gray-800 rounded-lg transition"
            //     title="Emoji"
            //   >
            //     <Smile className="h-5 w-5 text-gray-400" />
            //   </button>
            // </>
          )} */}

          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onFocus={handleInputFocus}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            style={{
              fontSize: mobile ? "16px" : "14px",
            }}
          />

          <button
            type="submit"
            disabled={!newMessage.trim()}
            className={`p-3 rounded-lg transition ${
              newMessage.trim()
                ? "bg-primary-600 hover:bg-primary-700"
                : "bg-gray-800 cursor-not-allowed"
            }`}
            title="Send message"
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </div>

        {!mobile && (
          <div className="mt-2 text-xs text-gray-500 flex justify-between">
            <span>Press Enter to send</span>
            <span>Shift+Enter for new line</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default ChatPanel;
