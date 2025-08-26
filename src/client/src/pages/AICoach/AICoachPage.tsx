import React from 'react';

const AICoachPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">AI Coach</h1>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <p className="text-gray-600 mb-4">Your personal AI mindfulness coach</p>
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700">👋 Hello! I'm your AI mindfulness coach. How can I support your practice today?</p>
        </div>
        <div className="flex">
          <input 
            type="text" 
            placeholder="Ask your coach anything..."
            className="flex-1 border border-gray-300 rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="bg-blue-600 text-white px-6 py-2 rounded-r-lg hover:bg-blue-700">
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default AICoachPage;