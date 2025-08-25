const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { logger, logSecurityEvent } = require('../utils/logger');
const { getPool } = require('../config/database');

class LLMService {
  constructor() {
    this.providers = {};
    this.defaultProvider = process.env.LLM_DEFAULT_PROVIDER || 'anthropic';
    this.timeout = parseInt(process.env.LLM_TIMEOUT) || 10000;
    this.maxRetries = parseInt(process.env.LLM_MAX_RETRIES) || 2;
    this.fallbackMessage = "I'm experiencing some technical difficulties right now. Let's try a grounding exercise: Take a deep breath in for 4 counts, hold for 4, then exhale for 6. Focus on the sensation of your breath.";

    this.initializeProviders();
  }

  initializeProviders() {
    // Initialize Anthropic Claude
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    logger.info('LLM providers initialized', { 
      providers: Object.keys(this.providers),
      default: this.defaultProvider 
    });
  }

  async generateResponse(context, message, options = {}) {
    const provider = options.provider || this.defaultProvider;
    const retries = options.retries || this.maxRetries;

    try {
      // Enrich context with RAG data
      const enrichedContext = await this.enrichWithRAG(context, message);
      
      // Check for crisis signals before generating response
      const crisisAssessment = await this.assessCrisisRisk(message, context);
      if (crisisAssessment.requiresIntervention) {
        return crisisAssessment;
      }

      // Generate response based on provider
      let response;
      switch (provider) {
        case 'anthropic':
          response = await this.callClaude(enrichedContext, message);
          break;
        case 'openai':
          response = await this.callOpenAI(enrichedContext, message);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      // Add citations and return
      return this.addCitations(response, enrichedContext.curriculum_context);

    } catch (error) {
      logger.error('LLM generation error:', { error: error.message, provider });
      
      if (this.isTimeout(error) || this.isRateLimit(error)) {
        if (retries > 0) {
          logger.info('Retrying LLM request', { retries: retries - 1 });
          await this.delay(1000);
          return this.generateResponse(context, message, { ...options, retries: retries - 1 });
        }
        return {
          response: this.fallbackMessage,
          isFallback: true,
          reason: 'timeout_or_rate_limit'
        };
      }

      // Try fallback provider
      if (retries > 0 && provider !== 'fallback') {
        const fallbackProvider = provider === 'anthropic' ? 'openai' : 'anthropic';
        if (this.providers[fallbackProvider]) {
          logger.info('Trying fallback provider', { from: provider, to: fallbackProvider });
          return this.generateResponse(context, message, { 
            ...options, 
            provider: fallbackProvider, 
            retries: retries - 1 
          });
        }
      }

      return {
        response: this.fallbackMessage,
        isFallback: true,
        reason: 'provider_error'
      };
    }
  }

  async callClaude(context, message) {
    const claude = this.providers.anthropic;
    if (!claude) {
      throw new Error('Anthropic provider not initialized');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const conversationHistory = this.formatConversationHistory(context.conversationHistory);

    const response = await Promise.race([
      claude.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: 'user', content: message }
        ]
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), this.timeout)
      )
    ]);

    return {
      response: response.content[0].text,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      model: 'claude-3-sonnet-20240229'
    };
  }

  async callOpenAI(context, message) {
    const openai = this.providers.openai;
    if (!openai) {
      throw new Error('OpenAI provider not initialized');
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const conversationHistory = this.formatConversationHistory(context.conversationHistory);

    const response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), this.timeout)
      )
    ]);

    return {
      response: response.choices[0].message.content,
      tokens: response.usage.total_tokens,
      model: 'gpt-4'
    };
  }

  buildSystemPrompt(context) {
    const curriculumContext = context.curriculum_context || [];
    const userContext = context.userContext || {};
    
    let prompt = `You are a compassionate AI mindfulness coach trained in the "Meeting Your Mind Full" methodology. Your role is to provide personalized guidance based on the user's progress and the curriculum content.

Core Principles:
- Always respond with warmth, empathy, and non-judgment
- Ground your responses in the curriculum materials when relevant
- Encourage self-discovery rather than giving direct advice
- Use mindfulness language and concepts appropriately
- Keep responses concise and actionable (2-3 paragraphs maximum)
- Never provide medical or psychological treatment advice

User Context:
- Progress: ${userContext.completedLessons || 0} lessons completed
- Current level: ${userContext.currentLevel || 'beginner'}
- Recent activity: ${userContext.recentActivity || 'none'}
- Preferences: ${JSON.stringify(userContext.preferences || {})}`;

    if (curriculumContext.length > 0) {
      prompt += `\n\nRelevant Curriculum Content:\n`;
      curriculumContext.forEach((content, index) => {
        prompt += `${index + 1}. "${content.title}" - ${content.excerpt}\n`;
      });
      prompt += `\nWhen referencing curriculum content, cite it as: "As covered in [Lesson Title]..."`;
    }

    prompt += `\n\nImportant: If the user expresses thoughts of self-harm, suicide, or serious mental health crisis, respond supportively but immediately note this requires professional help and provide crisis resources.`;

    return prompt;
  }

  formatConversationHistory(history) {
    if (!history || !Array.isArray(history)) return [];
    
    return history.slice(-10).map(msg => ({
      role: msg.sender === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
  }

  async enrichWithRAG(context, message) {
    try {
      // Search for relevant curriculum content using vector similarity
      const relevantContent = await this.searchCurriculumContent(message);
      
      return {
        ...context,
        curriculum_context: relevantContent
      };
    } catch (error) {
      logger.error('RAG enrichment error:', error);
      return context;
    }
  }

  async searchCurriculumContent(message, limit = 5) {
    // For now, use basic keyword matching. In production, this would use vector embeddings
    const pool = getPool();
    
    // Simple keyword extraction (in production, use proper NLP)
    const keywords = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 10);

    if (keywords.length === 0) return [];

    const searchPattern = keywords.join('|');
    
    const result = await pool.query(`
      SELECT 
        l.id, l.title, l.content_text,
        c.title as course_title,
        LEFT(l.content_text, 200) as excerpt
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE c.status_id = 5 
        AND (l.title ~* $1 OR l.content_text ~* $1 OR l.learning_objectives::text ~* $1)
      ORDER BY 
        CASE 
          WHEN l.title ~* $1 THEN 3
          WHEN l.learning_objectives::text ~* $1 THEN 2
          ELSE 1
        END DESC
      LIMIT $2
    `, [searchPattern, limit]);

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      courseTitle: row.course_title,
      excerpt: row.excerpt || ''
    }));
  }

  addCitations(response, curriculumContext) {
    if (!curriculumContext || curriculumContext.length === 0) {
      return { ...response, citations: [] };
    }

    // Simple citation matching - in production, use more sophisticated NLP
    const citations = [];
    curriculumContext.forEach(content => {
      const titleWords = content.title.toLowerCase().split(/\s+/);
      const hasReference = titleWords.some(word => 
        word.length > 3 && response.response.toLowerCase().includes(word)
      );
      
      if (hasReference) {
        citations.push({
          lessonId: content.id,
          title: content.title,
          courseTitle: content.courseTitle
        });
      }
    });

    return {
      ...response,
      citations
    };
  }

  async assessCrisisRisk(message, context) {
    const crisisDetector = new CrisisDetector();
    return await crisisDetector.assessRisk(message, context.conversationHistory, context.userContext);
  }

  isTimeout(error) {
    return error.message.includes('Timeout') || 
           error.code === 'ECONNABORTED' ||
           error.name === 'TimeoutError';
  }

  isRateLimit(error) {
    return error.status === 429 || 
           error.message.includes('rate limit') ||
           error.message.includes('quota exceeded');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CrisisDetector {
  constructor() {
    this.HIGH_RISK_THRESHOLD = 0.8;
    this.MEDIUM_RISK_THRESHOLD = 0.5;
    
    // Crisis keywords with weights
    this.crisisKeywords = [
      { pattern: /\b(kill|suicide|end it all|don't want to live)\b/i, weight: 1.0 },
      { pattern: /\b(hurt myself|self harm|cutting|overdose)\b/i, weight: 0.9 },
      { pattern: /\b(hopeless|can't go on|no point|give up)\b/i, weight: 0.7 },
      { pattern: /\b(depressed|anxious|panic|overwhelmed)\b/i, weight: 0.4 },
      { pattern: /\b(stressed|worried|sad|lonely)\b/i, weight: 0.2 }
    ];

    // Negation patterns that reduce risk
    this.negationPatterns = [
      /\b(not|don't|won't|never|no longer|used to|in the past)\b/i,
      /\b(feeling better|getting help|seeing therapist|taking medication)\b/i
    ];
  }

  async assessRisk(message, conversationHistory, userContext) {
    try {
      const signals = {
        keywords: this.detectKeywords(message),
        sentiment: this.analyzeSentiment(message),
        temporalPattern: this.analyzeTemporalPatterns(conversationHistory),
        negation: this.handleNegation(message),
        priorFlags: userContext.riskHistory || [],
        contextualFactors: this.assessContextualFactors(userContext)
      };

      const riskScore = this.calculateCompositeRisk(signals);

      if (riskScore >= this.HIGH_RISK_THRESHOLD) {
        await this.queueForHumanReview({
          userId: userContext.userId,
          signals: signals,
          riskScore: riskScore,
          redactedContent: this.redactPII(message),
          suggestedResources: this.getRegionalResources(userContext.location || 'US')
        });

        logSecurityEvent('crisis_risk_detected', {
          userId: userContext.userId,
          riskScore: riskScore,
          severity: 'high'
        });

        return {
          requiresIntervention: true,
          response: this.generateSupportiveResponse(),
          resources: this.getRegionalHotlines(userContext.location || 'US'),
          escalation: 'queued_for_review',
          riskScore: riskScore
        };
      }

      if (riskScore >= this.MEDIUM_RISK_THRESHOLD) {
        logSecurityEvent('crisis_risk_detected', {
          userId: userContext.userId,
          riskScore: riskScore,
          severity: 'medium'
        });
      }

      return { 
        requiresIntervention: false, 
        riskScore: riskScore,
        monitoring: riskScore > this.MEDIUM_RISK_THRESHOLD
      };

    } catch (error) {
      logger.error('Crisis detection error:', error);
      return { requiresIntervention: false, riskScore: 0, error: true };
    }
  }

  detectKeywords(message) {
    let keywordScore = 0;
    const matches = [];

    this.crisisKeywords.forEach(({ pattern, weight }) => {
      const match = message.match(pattern);
      if (match) {
        keywordScore += weight;
        matches.push({ keyword: match[0], weight });
      }
    });

    return { score: Math.min(keywordScore, 1.0), matches };
  }

  analyzeSentiment(message) {
    // Simple sentiment analysis - in production, use proper NLP library
    const negativeWords = ['sad', 'depressed', 'hopeless', 'terrible', 'awful', 'worst', 'hate', 'angry'];
    const positiveWords = ['good', 'better', 'happy', 'grateful', 'peaceful', 'calm', 'hopeful'];
    
    const words = message.toLowerCase().split(/\s+/);
    let sentiment = 0;
    
    words.forEach(word => {
      if (negativeWords.includes(word)) sentiment -= 1;
      if (positiveWords.includes(word)) sentiment += 1;
    });
    
    // Normalize to 0-1 scale (higher = more negative/risky)
    return Math.max(0, Math.min(1, (-sentiment / words.length) + 0.5));
  }

  analyzeTemporalPatterns(conversationHistory) {
    if (!conversationHistory || conversationHistory.length < 2) return 0;
    
    const recentMessages = conversationHistory.slice(-5);
    const crisisTerms = recentMessages.filter(msg => 
      this.crisisKeywords.some(({ pattern }) => pattern.test(msg.content))
    ).length;
    
    return crisisTerms / recentMessages.length;
  }

  handleNegation(message) {
    const hasNegation = this.negationPatterns.some(pattern => pattern.test(message));
    return hasNegation ? 0.3 : 1.0; // Reduce risk if negation is present
  }

  assessContextualFactors(userContext) {
    let score = 0;
    
    // Time of day (higher risk late night/early morning)
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) score += 0.2;
    
    // Recent activity patterns
    if (userContext.recentActivity === 'declined') score += 0.3;
    
    return score;
  }

  calculateCompositeRisk(signals) {
    const weights = {
      keywords: 0.4,
      sentiment: 0.2,
      temporalPattern: 0.2,
      contextualFactors: 0.1,
      negation: -0.1 // Negative weight to reduce overall risk
    };

    let riskScore = 0;
    riskScore += signals.keywords.score * weights.keywords;
    riskScore += signals.sentiment * weights.sentiment;
    riskScore += signals.temporalPattern * weights.temporalPattern;
    riskScore += signals.contextualFactors * weights.contextualFactors;
    riskScore *= signals.negation; // Apply negation multiplier

    // Factor in prior risk history
    if (signals.priorFlags.length > 0) {
      riskScore += 0.1; // Slight increase if user has history
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  async queueForHumanReview(reviewData) {
    try {
      const pool = getPool();
      
      // Store in human review queue
      await pool.query(`
        INSERT INTO human_review_queue (
          user_id, content_type, risk_score, signals, 
          redacted_content, suggested_resources, created_at, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      `, [
        reviewData.userId,
        'crisis_detection',
        reviewData.riskScore,
        JSON.stringify(reviewData.signals),
        reviewData.redactedContent,
        JSON.stringify(reviewData.suggestedResources),
        reviewData.riskScore >= 0.9 ? 'urgent' : 'high'
      ]);

      logger.info('Crisis review queued', { 
        userId: reviewData.userId, 
        riskScore: reviewData.riskScore 
      });
      
    } catch (error) {
      logger.error('Failed to queue crisis review:', error);
    }
  }

  generateSupportiveResponse() {
    return `I hear that you're going through a difficult time, and I want you to know that your feelings are valid and you're not alone. While I'm here to support your mindfulness practice, I think it would be helpful to speak with someone who can provide more comprehensive support.

If you're having thoughts of hurting yourself, please reach out to a crisis hotline immediately - they have trained counselors available 24/7. In the meantime, let's try a grounding exercise: Notice 5 things you can see, 4 things you can touch, 3 things you can hear, 2 things you can smell, and 1 thing you can taste.`;
  }

  getRegionalHotlines(location) {
    const resources = {
      'US': [
        { name: 'National Suicide Prevention Lifeline', phone: '988', available: '24/7' },
        { name: 'Crisis Text Line', text: 'HOME to 741741', available: '24/7' }
      ],
      'UK': [
        { name: 'Samaritans', phone: '116 123', available: '24/7' },
        { name: 'Crisis Text Line UK', text: 'SHOUT to 85258', available: '24/7' }
      ],
      'CA': [
        { name: 'Canada Suicide Prevention Service', phone: '1-833-456-4566', available: '24/7' },
        { name: 'Crisis Services Canada', text: '45645', available: '24/7' }
      ]
    };

    return resources[location] || resources['US'];
  }

  getRegionalResources(location) {
    return {
      location,
      hotlines: this.getRegionalHotlines(location),
      additionalResources: [
        'https://suicidepreventionlifeline.org',
        'https://www.crisistextline.org'
      ]
    };
  }

  redactPII(content) {
    // Remove potential PII from content before logging
    return content
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, '[SSN]')
      .replace(/\b\d{3}-?\d{3}-?\d{4}\b/g, '[PHONE]')
      .replace(/\b\d{16}\b/g, '[CARD]');
  }
}

// Add human review queue table if not exists
const createReviewQueueTable = async () => {
  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS human_review_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        content_type TEXT NOT NULL,
        risk_score NUMERIC(3,2),
        signals JSONB DEFAULT '{}',
        redacted_content TEXT,
        suggested_resources JSONB DEFAULT '{}',
        priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'completed', 'escalated')),
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_review_queue_status_priority 
        ON human_review_queue(status, priority, created_at) 
        WHERE status = 'pending';
    `);
  } catch (error) {
    logger.error('Failed to create review queue table:', error);
  }
};

// Initialize table on startup
createReviewQueueTable();

module.exports = { LLMService: new LLMService(), CrisisDetector };