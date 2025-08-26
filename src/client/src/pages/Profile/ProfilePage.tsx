import React from 'react';
import { useAuth } from '../../hooks/useAuth';

const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Profile</h1>
      
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-xl font-semibold text-blue-600">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </span>
          </div>
          <div className="ml-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {user?.firstName} {user?.lastName}
            </h2>
            <p className="text-gray-600">{user?.email}</p>
            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mt-1">
              {user?.role}
            </span>
          </div>
        </div>
        
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Settings</h3>
          <div className="space-y-4">
            <button className="block w-full text-left p-3 border rounded-lg hover:bg-gray-50">
              Edit Profile Information
            </button>
            <button className="block w-full text-left p-3 border rounded-lg hover:bg-gray-50">
              Change Password
            </button>
            <button className="block w-full text-left p-3 border rounded-lg hover:bg-gray-50">
              Privacy Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;