import React from 'react';
import { Github, Linkedin, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-black/40 backdrop-blur-md py-4 px-6 mt-auto">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span>Developed with</span>
          <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500 animate-pulse" />
          <span>by <span className="font-semibold text-neutral-200">Shantanu</span></span>
        </div>
        
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/shantanu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white transition-colors duration-200"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </a>
          <a
            href="https://linkedin.com/in/shantanu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-blue-400 transition-colors duration-200"
          >
            <Linkedin className="h-4 w-4" />
            <span>LinkedIn</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
