import React from 'react';

const CommunityPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Community</h1>
      <p className="text-gray-600 mb-8">Connect with fellow mindfulness practitioners</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">🌱 Beginner's Circle</h3>
          <p className="text-gray-600 text-sm mb-4">A supportive space for those new to mindfulness</p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">24 members</span>
            <button className="text-blue-600 text-sm hover:text-blue-700">Join Group</button>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">🧘 Daily Practice</h3>
          <p className="text-gray-600 text-sm mb-4">Share your daily mindfulness experiences</p>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">42 members</span>
            <button className="text-blue-600 text-sm hover:text-blue-700">Join Group</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;