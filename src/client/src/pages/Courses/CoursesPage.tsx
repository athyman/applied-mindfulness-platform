import React from 'react';

const CoursesPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Courses</h1>
      <p className="text-gray-600 mb-8">Explore mindfulness courses and learning paths</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="w-full h-32 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Introduction to Mindfulness</h3>
          <p className="text-gray-600 text-sm mb-4">Learn the fundamentals of mindful awareness</p>
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Beginner</span>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="w-full h-32 bg-gradient-to-br from-green-100 to-green-200 rounded-lg mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Meditation Techniques</h3>
          <p className="text-gray-600 text-sm mb-4">Explore various meditation practices</p>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Intermediate</span>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="w-full h-32 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Advanced Practice</h3>
          <p className="text-gray-600 text-sm mb-4">Deepen your mindfulness journey</p>
          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">Advanced</span>
        </div>
      </div>
    </div>
  );
};

export default CoursesPage;