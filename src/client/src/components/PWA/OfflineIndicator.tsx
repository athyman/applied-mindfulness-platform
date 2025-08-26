import React from 'react';

const OfflineIndicator: React.FC = () => {
  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm z-50">
      <span className="font-medium">You are offline</span>
      <span className="ml-2 opacity-75">Some features may be limited</span>
    </div>
  );
};

export default OfflineIndicator;