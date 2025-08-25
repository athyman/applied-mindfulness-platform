-- Applied Mindfulness Platform - Initial Database Schema
-- Based on the comprehensive implementation guide

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Status lookup table instead of ENUM for maintainability
CREATE TABLE content_statuses (
  id SMALLINT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed content statuses
INSERT INTO content_statuses (id, name, description) VALUES 
(1, 'draft', 'Content is being created'),
(2, 'pending', 'Content is awaiting review'),
(3, 'approved', 'Content has been approved for publication'),
(4, 'rejected', 'Content was rejected and needs revision'),
(5, 'published', 'Content is live and available to users');

-- User roles lookup table
CREATE TABLE user_roles (
  id SMALLINT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_roles (id, name, description) VALUES
(1, 'student', 'Regular platform user'),
(2, 'instructor', 'Can create and manage course content'),
(3, 'coach', 'Licensed professional coach'),
(4, 'moderator', 'Can moderate community content'),
(5, 'admin', 'Full platform administration access');

-- Verification levels for progressive trust model
CREATE TABLE verification_levels (
  id SMALLINT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  requirements JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO verification_levels (id, name, description, requirements) VALUES
(1, 'basic', 'Email/phone verification', '{"email": true, "phone": true}'),
(2, 'identity', 'Government ID verification', '{"government_id": true}'),
(3, 'professional', 'Background check for coaches', '{"background_check": true, "license_verification": true}');

-- Core users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  timezone TEXT DEFAULT 'UTC',
  role_id SMALLINT NOT NULL REFERENCES user_roles(id) DEFAULT 1,
  verification_level_id SMALLINT NOT NULL REFERENCES verification_levels(id) DEFAULT 1,
  profile_data JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role_id, is_active);
CREATE INDEX idx_users_verification ON users(verification_level_id);
CREATE INDEX idx_users_profile ON users USING GIN(profile_data);

-- Instructors table for content creators
CREATE TABLE instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  credentials JSONB DEFAULT '[]',
  specializations JSONB DEFAULT '[]',
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_instructors_status ON instructors(approval_status);
CREATE INDEX idx_instructors_user ON instructors(user_id);

-- Courses table
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  author_id UUID NOT NULL REFERENCES instructors(id),
  status_id SMALLINT NOT NULL REFERENCES content_statuses(id),
  progressive_order INT,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  estimated_duration_minutes INT CHECK (estimated_duration_minutes > 0),
  metadata JSONB DEFAULT '{}',
  thumbnail_url TEXT,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_author_status ON courses(author_id, status_id);
CREATE INDEX idx_courses_metadata ON courses USING GIN(metadata);
CREATE INDEX idx_courses_difficulty ON courses(difficulty_level, status_id);

-- Lessons table
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('video','audio','text','interactive')),
  content_url TEXT,
  content_text TEXT,
  duration_minutes INT CHECK (duration_minutes >= 0),
  prerequisites JSONB DEFAULT '[]',
  learning_objectives JSONB DEFAULT '[]',
  branching_rules JSONB DEFAULT '{}',
  sequence_order INT NOT NULL,
  thumbnail_url TEXT,
  transcript TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, sequence_order)
);

CREATE INDEX idx_lessons_course_seq ON lessons(course_id, sequence_order);
CREATE INDEX idx_lessons_prerequisites ON lessons USING GIN(prerequisites);
CREATE INDEX idx_lessons_content_type ON lessons(content_type);

-- User progress tracking
CREATE TABLE user_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  completed_at TIMESTAMPTZ,
  time_spent_minutes INT DEFAULT 0 CHECK (time_spent_minutes >= 0),
  interaction_data JSONB DEFAULT '{}',
  notes TEXT,
  bookmarked BOOLEAN DEFAULT FALSE,
  rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX idx_user_progress_completion ON user_progress(user_id, completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_user_progress_bookmarks ON user_progress(user_id, bookmarked) WHERE bookmarked = TRUE;

-- AI Conversations
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_end TIMESTAMPTZ,
  context_summary TEXT,
  long_term_summary TEXT,
  summary_updated_at TIMESTAMPTZ,
  total_tokens_used INT DEFAULT 0,
  quality_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conv_user_active ON ai_conversations(user_id, session_end) WHERE session_end IS NULL;
CREATE INDEX idx_ai_conv_user_recent ON ai_conversations(user_id, created_at);

-- Conversation messages
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user','assistant','system')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  token_count INT DEFAULT 0,
  sentiment_score NUMERIC(3,2),
  risk_signals JSONB DEFAULT '{}',
  flagged_for_review BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_msg_conv_time ON conversation_messages(conversation_id, created_at);
CREATE INDEX idx_conv_msg_risk ON conversation_messages(conversation_id) WHERE (risk_signals->>'severity')::int > 1;
CREATE INDEX idx_conv_msg_review ON conversation_messages(flagged_for_review, created_at) WHERE flagged_for_review = TRUE;

-- Community Groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  group_type TEXT NOT NULL CHECK (group_type IN ('interest','location','practice_level')),
  member_count INT DEFAULT 0,
  max_members INT DEFAULT 50 CHECK (max_members >= 10 AND max_members <= 50),
  leader_id UUID NOT NULL REFERENCES users(id),
  verification_required BOOLEAN DEFAULT FALSE,
  moderation_settings JSONB DEFAULT '{}',
  privacy_level TEXT NOT NULL DEFAULT 'public' CHECK (privacy_level IN ('public', 'private', 'invite_only')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_groups_active_type ON groups(group_type, is_active);
CREATE INDEX idx_groups_leader ON groups(leader_id);
CREATE INDEX idx_groups_privacy ON groups(privacy_level, is_active);

-- Group memberships
CREATE TABLE group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  UNIQUE(group_id, user_id, left_at)
);

CREATE INDEX idx_group_members_active ON group_memberships(group_id, user_id) WHERE left_at IS NULL;
CREATE INDEX idx_user_groups_active ON group_memberships(user_id, group_id) WHERE left_at IS NULL;

-- Group messages
CREATE TABLE group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_metadata JSONB DEFAULT '{}',
  ai_risk_score NUMERIC(3,2),
  human_reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_group_msg_moderation ON group_messages(moderation_status, created_at) WHERE moderation_status = 'pending';
CREATE INDEX idx_group_msg_group_time ON group_messages(group_id, created_at);
CREATE INDEX idx_group_msg_user ON group_messages(user_id, created_at);

-- User consents for GDPR/CCPA compliance
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  withdrawal_timestamp TIMESTAMPTZ,
  UNIQUE(user_id, consent_type, consent_version)
);

CREATE INDEX idx_consent_user_active ON user_consents(user_id, consent_type) WHERE withdrawal_timestamp IS NULL;

-- Data retention policies
CREATE TABLE data_retention_policies (
  data_type TEXT PRIMARY KEY,
  retention_days INT NOT NULL,
  deletion_strategy TEXT NOT NULL CHECK (deletion_strategy IN ('hard_delete', 'soft_delete', 'anonymize')),
  legal_basis TEXT NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed retention policies
INSERT INTO data_retention_policies (data_type, retention_days, deletion_strategy, legal_basis) VALUES
('user_profiles', 2555, 'soft_delete', 'Legitimate interest - 7 years'),
('conversation_messages', 1095, 'anonymize', 'Consent - 3 years'),
('group_messages', 365, 'hard_delete', 'Consent - 1 year'),
('progress_data', 2555, 'soft_delete', 'Legitimate interest - 7 years'),
('audit_logs', 2190, 'hard_delete', 'Legal requirement - 6 years');

-- Audit log table for compliance
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  changes JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_time ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action_time ON audit_logs(action, created_at);