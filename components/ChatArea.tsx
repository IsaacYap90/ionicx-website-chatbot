"use client";

import { useEffect, useRef, useState } from "react";
import config from "@/config";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import {
  HandHelping,
  WandSparkles,
  BookOpenText,
  ChevronDown,
  Send,
  LifeBuoyIcon,
  Zap,
} from "lucide-react";
import "highlight.js/styles/atom-one-dark.css";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const UISelector = ({
  redirectToAgent,
}: {
  redirectToAgent: { should_redirect: boolean; reason: string };
}) => {
  if (redirectToAgent.should_redirect) {
    return (
      <Button
        size="sm"
        className="mt-2 flex items-center space-x-2"
        onClick={() => {
          window.open("https://ionicx.com/contact", "_blank");
        }}
      >
        <LifeBuoyIcon className="w-4 h-4" />
        <small className="text-sm leading-none">Talk to our team</small>
      </Button>
    );
  }
  return null;
};

const SuggestedQuestions = ({
  questions,
  onQuestionClick,
  isLoading,
}: {
  questions: string[];
  onQuestionClick: (question: string) => void;
  isLoading: boolean;
}) => {
  if (!questions || questions.length === 0) return null;
  return (
    <div className="mt-2 pl-10">
      {questions.map((question, index) => (
        <Button
          key={index}
          className="text-sm mb-2 mr-2 ml-0 text-gray-500 shadow-sm"
          variant="outline"
          size="sm"
          onClick={() => onQuestionClick(question)}
          disabled={isLoading}
        >
          {question}
        </Button>
      ))}
    </div>
  );
};

const MessageContent = ({
  content,
  role,
}: {
  content: string;
  role: string;
}) => {
  const [thinking, setThinking] = useState(true);
  const [parsed, setParsed] = useState<{
    response?: string;
    redirect_to_agent?: { should_redirect: boolean; reason: string };
  }>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!content || role !== "assistant") return;

    // Reset state on content change
    setError(false);
    setThinking(true);

    const timer = setTimeout(() => {
      setError(true);
      setThinking(false);
    }, 30000);

    try {
      const result = JSON.parse(content);
      if (result.response && result.response.length > 0 && result.response !== "...") {
        setParsed(result);
        setThinking(false);
        setError(false);
        clearTimeout(timer);
      }
    } catch {
      // Not valid JSON — show content as-is
      setParsed({ response: content.startsWith("{") ? "I'm processing your request..." : content });
      setError(false);
      setThinking(false);
    }

    return () => clearTimeout(timer);
  }, [content, role]);

  if (thinking && role === "assistant") {
    return (
      <div className="flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400 mr-2" />
        <span>Thinking...</span>
      </div>
    );
  }

  if (error && !parsed.response) {
    return <div>Something went wrong. Please try again.</div>;
  }

  return (
    <>
      <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeHighlight]}>
        {parsed.response || (() => { try { const p = JSON.parse(content); return p.response || "I'm here to help! Ask me about IonicX services."; } catch { return content.startsWith("{") ? "I'm here to help! Ask me about IonicX services." : content; } })()}
      </ReactMarkdown>
      {parsed.redirect_to_agent && (
        <UISelector redirectToAgent={parsed.redirect_to_agent} />
      )}
    </>
  );
};

type Model = { id: string; name: string };

interface Message {
  id: string;
  role: string;
  content: string;
}

function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("minimax-m2.1");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const models: Model[] = [
    { id: "minimax-m2.1", name: "IonicX AI" },
  ];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: messages.length <= 2 ? "auto" : "smooth",
          block: "end",
        });
      }, 100);
    }
  }, [messages]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement> | string) => {
    if (typeof event !== "string") event.preventDefault();
    setIsLoading(true);

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: typeof event === "string" ? event : input,
    };

    const placeholderMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: JSON.stringify({
        response: "",
        thinking: "Processing...",
        user_mood: "neutral",
        suggested_questions: [],
        debug: { context_used: false },
      }),
    };

    setMessages((prev) => [...prev, userMessage, placeholderMessage]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel,
        }),
      });

      if (!response.ok) throw new Error(`API request failed: ${response.status}`);

      const data = await response.json();

      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: JSON.stringify(data),
        };
        return newMessages;
      });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() !== "") handleSubmit(e as any);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 300)}px`;
  };

  return (
    <Card className="flex-1 flex flex-col mb-4 mr-4 ml-4 border-gray-800">
      <CardContent className="flex-1 flex flex-col overflow-hidden pt-4 px-4 pb-0">
        {/* Powered by line */}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full animate-fade-in-up">
              <div className="w-12 h-12 mb-4 rounded-full bg-gradient-to-br from-cyan-400 to-green-400 flex items-center justify-center">
                <Zap className="w-6 h-6 text-gray-900" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">IonicX AI Assistant</h2>
              <p className="text-muted-foreground mb-8">How can I help you today?</p>
              <div className="space-y-4 text-sm max-w-md">
                <div className="flex items-center gap-3">
                  <HandHelping className="text-cyan-400 shrink-0" />
                  <p className="text-muted-foreground">
                    Ask about our AI-powered websites, chatbots, and digital solutions
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <WandSparkles className="text-green-400 shrink-0" />
                  <p className="text-muted-foreground">
                    Get pricing info — 4 tiers from S$2,888 to S$15,888
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <BookOpenText className="text-cyan-400 shrink-0" />
                  <p className="text-muted-foreground">
                    Learn about our services and book a free consultation
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={message.id}>
                  <div
                    className={`flex items-start ${message.role === "user" ? "justify-end" : ""} ${
                      index === messages.length - 1 ? "animate-fade-in-up" : ""
                    }`}
                    style={{ animationDuration: "300ms", animationFillMode: "backwards" }}
                  >
                    {message.role === "assistant" && (
                      <Avatar className="w-8 h-8 mr-2 border border-cyan-400/30">
                        <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-green-400 text-gray-900 text-xs font-bold">
                          IX
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`p-3 rounded-md text-sm max-w-[65%] ${
                        message.role === "user"
                          ? "bg-gradient-to-r from-cyan-500 to-green-500 text-white"
                          : "bg-muted border"
                      }`}
                    >
                      <MessageContent content={message.content} role={message.role} />
                    </div>
                  </div>
                  {message.role === "assistant" && (() => {
                    try {
                      const parsed = JSON.parse(message.content);
                      return (
                        <SuggestedQuestions
                          questions={parsed.suggested_questions || []}
                          onQuestionClick={(q) => handleSubmit(q)}
                          isLoading={isLoading}
                        />
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              ))}
              <div ref={messagesEndRef} style={{ height: "1px" }} />
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col w-full relative bg-background border rounded-xl focus-within:ring-2 focus-within:ring-cyan-400 focus-within:ring-offset-2"
        >
          <Textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about IonicX services, pricing, or anything else..."
            disabled={isLoading}
            className="resize-none min-h-[44px] bg-background border-0 p-3 rounded-xl shadow-none focus-visible:ring-0"
            rows={1}
          />
          <div className="flex justify-between items-center p-3">
            <span className="text-xs text-muted-foreground">Powered by IonicX AI</span>
            <Button
              type="submit"
              disabled={isLoading || input.trim() === ""}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-green-500 hover:from-cyan-600 hover:to-green-600 text-white"
              size="sm"
            >
              {isLoading ? (
                <div className="animate-spin h-5 w-5 border-t-2 border-white rounded-full" />
              ) : (
                <>
                  Send
                  <Send className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}

export default ChatArea;
