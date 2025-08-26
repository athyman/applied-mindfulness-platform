import React from 'react';
import { usePWA } from '../../hooks/usePWA';

const PWAInstallPrompt: React.FC = () => {
  const { installApp } = usePWA();

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Install App</h3>
          <p className="text-xs opacity-90">Get the full experience</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={installApp}
            className="bg-white text-blue-600 px-3 py-1 rounded text-xs font-medium hover:bg-blue-50"
          >
            Install
          </button>
          <button
            onClick={() => {/* Close prompt */}}
            className="text-white opacity-70 hover:opacity-100 text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;