import React from 'react';
import Layout from '../../components/Layout/Layout';

const HomePage: React.FC = () => {
  return (
    <Layout>
      <div className="text-center">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Welcome to{' '}
            <span className="text-blue-600">Applied Mindfulness</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Transform your mind through structured learning, AI-powered coaching, 
            and a supportive community focused on mindfulness practice.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors">
              Start Learning
            </button>
            <button className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-4 rounded-lg font-semibold text-lg transition-colors">
              Explore Courses
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🧘</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Mindfulness Instruction
            </h3>
            <p className="text-gray-600">
              Structured learning paths with video content, guided meditations, 
              and progressive skill development.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              AI Coaching
            </h3>
            <p className="text-gray-600">
              Personalized guidance powered by advanced AI, grounded in curriculum 
              content with safety measures.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">👥</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Community Support
            </h3>
            <p className="text-gray-600">
              Connect with like-minded practitioners in small groups with 
              moderated discussions and events.
            </p>
          </div>
        </div>

        {/* Status Section */}
        <div className="mt-16 bg-blue-50 rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Development Status
          </h2>
          <div className="max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div>
                <h3 className="font-semibold text-green-800 mb-2">✅ Completed</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Database schema & migrations</li>
                  <li>• User management system</li>
                  <li>• Redis cache integration</li>
                  <li>• Security & compliance framework</li>
                  <li>• Development environment</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">🔄 In Progress</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• React component development</li>
                  <li>• Authentication system</li>
                  <li>• API route implementations</li>
                  <li>• Mobile testing setup</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;