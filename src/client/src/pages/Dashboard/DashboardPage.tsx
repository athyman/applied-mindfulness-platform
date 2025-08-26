import React from 'react';

const DashboardPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Learning Progress</h2>
          <p className="text-gray-600 text-sm">Track your mindfulness journey</p>
          <div className="mt-4 bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full w-1/3"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Coach</h2>
          <p className="text-gray-600 text-sm">Get personalized guidance</p>
          <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Start Session
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Community</h2>
          <p className="text-gray-600 text-sm">Connect with others</p>
          <button className="mt-4 border border-blue-600 text-blue-600 px-4 py-2 rounded text-sm hover:bg-blue-50">
            Join Groups
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;