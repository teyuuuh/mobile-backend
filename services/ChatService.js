// src/services/ChatService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeepSeekService from './DeepSeekService';

class ChatService {
  constructor() {
    this.conversationHistory = [];
    this.responseCache = new Map(); // In-memory cache for session
    this.lastCacheClean = Date.now();
    this.userProfile = null;
    this.currentTopic = null;
    this.predefinedResponses = this.loadPredefinedResponses();
    
    // Initialize persistent storage
    this.initializeStorage();
  }

  // Initialize AsyncStorage for React Native
  async initializeStorage() {
    try {
      // Load conversation history from AsyncStorage
      const savedHistory = await AsyncStorage.getItem('clams_conversation_history');
      if (savedHistory) {
        this.conversationHistory = JSON.parse(savedHistory);
      }

      // Load user profile
      const savedProfile = await AsyncStorage.getItem('clams_user_profile');
      if (savedProfile) {
        this.userProfile = JSON.parse(savedProfile);
      }

      // Load cached responses (limited for mobile performance)
      const savedCache = await AsyncStorage.getItem('clams_response_cache');
      if (savedCache) {
        const cacheData = JSON.parse(savedCache);
        // Only load recent cache entries (last 24 hours)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        Object.entries(cacheData).forEach(([key, value]) => {
          if (value.timestamp > oneDayAgo) {
            this.responseCache.set(key, value.response);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to load saved data:', error);
    }
  }

  // Save data to AsyncStorage
  async saveToStorage() {
    try {
      // Save conversation history (limit to last 50 messages for mobile)
      const limitedHistory = this.conversationHistory.slice(-50);
      await AsyncStorage.setItem('clams_conversation_history', JSON.stringify(limitedHistory));

      // Save user profile
      if (this.userProfile) {
        await AsyncStorage.setItem('clams_user_profile', JSON.stringify(this.userProfile));
      }

      // Save response cache (only recent entries)
      const cacheToSave = {};
      let count = 0;
      for (const [key, value] of this.responseCache.entries()) {
        if (count < 25) { // Limit cache size for mobile
          cacheToSave[key] = {
            response: value,
            timestamp: Date.now()
          };
          count++;
        }
      }
      await AsyncStorage.setItem('clams_response_cache', JSON.stringify(cacheToSave));
    } catch (error) {
      console.warn('Failed to save data:', error);
    }
  }

  loadPredefinedResponses() {
    return {
      // Instant responses for most common questions
      "library hours": "⏰ CLAMS Hours: Mon-Fri 9AM-5PM, Study rooms until 8PM, Digital access 24/7 for members",
      "operating hours": "⏰ CLAMS Hours: Mon-Fri 9AM-5PM, Study rooms until 8PM, Digital access 24/7 for members",
      "what time": "⏰ CLAMS Hours: Mon-Fri 9AM-5PM, Study rooms until 8PM, Digital access 24/7 for members",
      
      "membership fee": "👥 Membership: Students ₱200/yr, Regular ₱500/yr, Seniors ₱250/yr, Researchers ₱800/yr",
      "how much": "👥 Membership: Students ₱200/yr, Regular ₱500/yr, Seniors ₱250/yr, Researchers ₱800/yr",
      "membership cost": "👥 Membership: Students ₱200/yr, Regular ₱500/yr, Seniors ₱250/yr, Researchers ₱800/yr",
      
      "how to borrow": "📖 Borrowing: Need CLAMS membership + ID. Members: 5 books/2wks, Students: 3 books/1wk, Renewals available",
      "borrow books": "📖 Borrowing: Need CLAMS membership + ID. Members: 5 books/2wks, Students: 3 books/1wk, Renewals available",
      
      "contact": "📞 Contact: info@clams.edu.ph | (02) 8123-4567 | Mon-Fri 9AM-5PM",
      "phone number": "📞 Contact: info@clams.edu.ph | (02) 8123-4567 | Mon-Fri 9AM-5PM",
      "email": "📞 Contact: info@clams.edu.ph | (02) 8123-4567 | Mon-Fri 9AM-5PM",
      
      "study room": "📚 Study Facilities: 100-seat reading room, 20 individual carrels, 5 group rooms (2-6 people), computer lab, free WiFi",
      "study space": "📚 Study Facilities: 100-seat reading room, 20 individual carrels, 5 group rooms (2-6 people), computer lab, free WiFi",
      
      "overdue fine": "💰 Overdue: ₱5 per day per book. Grace period: 1 day. Account suspended at 30+ days overdue",
      "fine": "💰 Overdue: ₱5 per day per book. Grace period: 1 day. Account suspended at 30+ days overdue",
      
      "hello": "Hello! I'm De Mallaca, your CLAMS librarian assistant! 📚 I can help with books, research, study spaces, membership, and all CLAMS services. What do you need?",
      "hi": "Hi there! I'm De Mallaca 📚 How can I help you with CLAMS library services today?",
      
      "what is clams": "CLAMS is Manila's Center of Library, Archives, and Museum Services. We have 50K+ books, digital resources, historical archives, and cultural exhibitions! 📚🏛️",
      "services": "🎯 CLAMS Services: Library (books, databases, study spaces), Archives (historical documents), Museum (exhibitions, tours), Research assistance, Digital resources",
      
      "where": "📍 CLAMS is located in Manila, Philippines. Contact us for specific directions: (02) 8123-4567",
      "location": "📍 CLAMS is located in Manila, Philippines. Contact us for specific directions: (02) 8123-4567"
    };
  }

  // Enhanced library-related keyword detection
  isLibraryRelated(userInput) {
    const input = userInput.toLowerCase();
    
    const libraryKeywords = [
      'clams', 'library', 'archives', 'museum',
      'books', 'book', 'borrow', 'borrowing', 'lending', 'loan', 'checkout',
      'study', 'research', 'reading', 'catalog', 'collection', 'database',
      'digital', 'ebook', 'journal', 'article', 'reference', 'bibliography',
      'member', 'membership', 'join', 'register', 'card', 'account',
      'fee', 'cost', 'price', 'payment', 'discount',
      'room', 'space', 'computer', 'wifi', 'internet', 'printer',
      'carrel', 'desk', 'seat', 'chair', 'table',
      'hours', 'schedule', 'open', 'close', 'holiday', 'weekend',
      'overdue', 'fine', 'penalty', 'renewal', 'extend', 'due date',
      'reservation', 'reserve', 'hold', 'request',
      'librarian', 'staff', 'help', 'assistance', 'support', 'guide',
      'tutorial', 'training', 'workshop', 'consultation', 'appointment',
      'fiction', 'nonfiction', 'textbook', 'thesis', 'dissertation',
      'manuscript', 'document', 'record', 'newspaper', 'magazine',
      'rare', 'special', 'filipiniana', 'historical', 'archive',
      'online', 'website', 'portal', 'system', 'opac', 'search',
      'download', 'access', 'login', 'password', 'remote'
    ];
    
    const serviceKeywords = [
      'how', 'what', 'where', 'when', 'why', 'can i', 'do you',
      'information', 'details', 'policy', 'procedure', 'process',
      'available', 'offer', 'provide', 'service', 'facility'
    ];
    
    const hasLibraryKeywords = libraryKeywords.some(keyword => input.includes(keyword));
    const hasServiceKeywords = serviceKeywords.some(keyword => input.includes(keyword));
    
    const educationalKeywords = ['student', 'study', 'homework', 'assignment', 'project', 'class', 'school', 'university', 'college', 'education'];
    const hasEducationalContext = educationalKeywords.some(keyword => input.includes(keyword));
    
    return hasLibraryKeywords || (hasServiceKeywords && hasEducationalContext);
  }

  // Enhanced fuzzy matching with partial word detection
  findBestPredefinedAnswer(userInput) {
    const input = userInput.toLowerCase().trim();
    
    if (this.predefinedResponses[input]) {
      return this.predefinedResponses[input];
    }
    
    for (const [key, response] of Object.entries(this.predefinedResponses)) {
      if (input.includes(key) || key.includes(input)) {
        return response;
      }
    }
    
    const inputWords = input.split(/\s+/);
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [question, answer] of Object.entries(this.predefinedResponses)) {
      const questionWords = question.split(/\s+/);
      let matchCount = 0;
      
      inputWords.forEach(inputWord => {
        if (questionWords.some(qWord => 
          inputWord.includes(qWord) || qWord.includes(inputWord)
        )) {
          matchCount++;
        }
      });
      
      const score = matchCount / Math.max(inputWords.length, questionWords.length);
      
      if (score > 0.5 && score > highestScore) {
        highestScore = score;
        bestMatch = answer;
      }
    }
    
    return bestMatch;
  }
  
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  // Enhanced context-aware response generation
  async generateResponse(userInput) {
    try {
      this.addToHistory('user', userInput);
      this.updateConversationContext(userInput);
      
      // Clean cache periodically (mobile-optimized)
      this.cleanCacheIfNeeded();
      
      // Check cache for exact matches
      const cacheKey = this.generateCacheKey(userInput);
      if (this.responseCache.has(cacheKey)) {
        console.log("🎯 Cache hit for:", userInput);
        const cachedResponse = this.responseCache.get(cacheKey);
        this.addToHistory('assistant', cachedResponse);
        return cachedResponse;
      }
      
      if (!this.isLibraryRelated(userInput)) {
        return this.handleNonLibraryQuery(userInput);
      }
      
      // Check predefined responses first
      const predefinedAnswer = this.findBestPredefinedAnswer(userInput);
      if (predefinedAnswer) {
        console.log("⚡ Predefined response for:", userInput);
        this.addToHistory('assistant', predefinedAnswer);
        this.responseCache.set(cacheKey, predefinedAnswer);
        
        // Save to persistent storage periodically
        if (Math.random() < 0.1) { // 10% chance to save
          this.saveToStorage();
        }
        
        return predefinedAnswer;
      }
      
      // Use AI for complex queries
      console.log("🤖 Using AI for:", userInput);
      const intent = this.detectUserIntent(userInput);
      const optimizedPrompt = this.buildOptimizedPrompt(userInput, intent);
      
      const response = await DeepSeekService.generateResponse(optimizedPrompt);
      this.addToHistory('assistant', response);
      
      // Cache AI responses
      this.responseCache.set(cacheKey, response);
      
      // Save to storage after AI responses
      this.saveToStorage();
      
      return response;
      
    } catch (error) {
      console.error("Error generating response:", error);
      return this.generateSmartFallback(userInput);
    }
  }

  generateCacheKey(userInput) {
    return userInput.toLowerCase()
      .replace(/[?!.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  buildOptimizedPrompt(userInput, intent) {
    let contextualInfo = "";
    
    if (this.conversationHistory.length > 2) {
      const recentHistory = this.conversationHistory.slice(-2);
      contextualInfo += `\nRecent: ${recentHistory.map(h => `${h.role}: ${h.content.substring(0, 50)}`).join('\n')}\n`;
    }
    
    const intentContext = this.getIntentContext(intent);
    
    return `${contextualInfo}\n${intentContext}\n\nUser: ${userInput}`;
  }

  getIntentContext(intent) {
    const contexts = {
      'find_book': "Help with book search and catalog.",
      'research_help': "Provide research assistance and database help.",
      'membership': "Explain membership process and benefits.",
      'study_space': "Info about study rooms and facilities.",
      'hours_location': "Give operating hours and location.",
      'digital_access': "Help with digital resources and e-books."
    };
    
    return contexts[intent] || "General CLAMS assistance.";
  }

  // Mobile-optimized cache cleaning
  cleanCacheIfNeeded() {
    const now = Date.now();
    if (now - this.lastCacheClean > 300000) { // Clean every 5 minutes
      if (this.responseCache.size > 25) { // Smaller cache for mobile
        const entries = Array.from(this.responseCache.entries());
        this.responseCache.clear();
        entries.slice(-15).forEach(([key, value]) => {
          this.responseCache.set(key, value);
        });
        console.log("🧹 Mobile cache optimized");
      }
      this.lastCacheClean = now;
    }
  }

  detectUserIntent(userInput) {
    const input = userInput.toLowerCase();
    
    const intents = {
      'find_book': ['find', 'search', 'looking for', 'need', 'book about'],
      'borrow_info': ['borrow', 'checkout', 'loan', 'take out'],
      'membership': ['join', 'member', 'registration', 'sign up'],
      'hours_location': ['hours', 'open', 'close', 'time', 'location', 'address'],
      'study_space': ['study', 'room', 'space', 'reserve', 'quiet'],
      'research_help': ['research', 'thesis', 'help', 'assistance', 'citation'],
      'digital_access': ['digital', 'online', 'ebook', 'database', 'remote'],
      'fees_fines': ['fee', 'cost', 'fine', 'overdue', 'penalty', 'price'],
      'archives': ['archives', 'historical', 'manuscript', 'documents'],
      'museum': ['museum', 'exhibition', 'exhibit', 'tour', 'display']
    };
    
    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(keyword => input.includes(keyword))) {
        return intent;
      }
    }
    
    return 'general_inquiry';
  }

  handleNonLibraryQuery(userInput) {
    const restrictionMessage = "I'm De Mallaca, your dedicated CLAMS librarian assistant! 📚 I specialize in helping with library services, book searches, research assistance, study facilities, membership information, and all things related to our Library, Archives, and Museum. What can I help you find or learn about at CLAMS today?";
    this.addToHistory('assistant', restrictionMessage);
    return restrictionMessage;
  }

  generateSmartFallback(userInput) {
    return "I'm here to help with all your CLAMS library needs! 📚 Whether you're looking for books, need research assistance, want to know about study facilities, or have questions about membership, I'm your go-to librarian assistant. What specific information can I help you find today?";
  }

  updateConversationContext(userInput) {
    const keywords = userInput.toLowerCase().split(/\s+/);
    
    if (keywords.includes('book') || keywords.includes('search')) {
      this.currentTopic = 'book_search';
    } else if (keywords.includes('membership') || keywords.includes('join')) {
      this.currentTopic = 'membership';
    } else if (keywords.includes('hours') || keywords.includes('open')) {
      this.currentTopic = 'hours_info';
    } else if (keywords.includes('study') || keywords.includes('room')) {
      this.currentTopic = 'study_space';
    } else if (keywords.includes('research') || keywords.includes('thesis')) {
      this.currentTopic = 'research_help';
    } else {
      this.currentTopic = null;
    }
  }

  async addToHistory(role, content) {
    this.conversationHistory.push({ 
      role, 
      content, 
      timestamp: new Date().toISOString() // Use ISO string for React Native compatibility
    });
    
    // Keep history manageable for mobile
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }
  }

  // Clear all stored data (useful for logout/reset)
  async clearAllData() {
    try {
      await AsyncStorage.multiRemove([
        'clams_conversation_history',
        'clams_user_profile',
        'clams_response_cache'
      ]);
      
      this.conversationHistory = [];
      this.responseCache.clear();
      this.userProfile = null;
      this.currentTopic = null;
      
      console.log("🧹 All data cleared");
    } catch (error) {
      console.warn('Failed to clear data:', error);
    }
  }

  // Get conversation history for UI
  getConversationHistory() {
    return this.conversationHistory;
  }

  // Set user profile for personalization
  async setUserProfile(profile) {
    this.userProfile = profile;
    await this.saveToStorage();
  }

  // Get cache statistics (useful for debugging)
  getCacheStats() {
    return {
      cacheSize: this.responseCache.size,
      historyLength: this.conversationHistory.length,
      currentTopic: this.currentTopic,
      lastCacheClean: new Date(this.lastCacheClean).toLocaleString()
    };
  }
}

export default new ChatService();