"use client";
import React from "react";
import { Zap } from "lucide-react";

const TopNavBar = () => {
  return (
    <nav className="text-foreground p-4 flex justify-between items-center border-b border-gray-800">
      <div className="font-bold text-xl flex gap-2 items-center">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-green-400 flex items-center justify-center">
          <Zap className="w-5 h-5 text-gray-900" />
        </div>
        <span className="bg-gradient-to-r from-cyan-400 to-green-400 bg-clip-text text-transparent">
          IonicX
        </span>
        <span className="text-sm font-normal text-muted-foreground ml-1">AI Assistant</span>
      </div>
    </nav>
  );
};

export default TopNavBar;
