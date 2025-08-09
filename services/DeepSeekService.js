// src/services/DeepSeekService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

class DeepSeekService {
  constructor() {
    this.apiKey = process.env.REACT_APP_OPENROUTER_API_KEY;
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    this.headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      "HTTP-Referer": "react-native-app",
      "X-Title": "CLAMS - De Mallaca Chatbot"
    };
    
    //console.log("🔑 OpenRouter API Key Status:", this.apiKey ? "✅ Loaded" : "❌ Missing");
  }

  // NEW: Optimized knowledge base (shorter for faster processing)
  getOptimizedCLAMSKnowledge() {
    return `
CLAMS (Manila): Library, Archives, Museum Services
📚 Library: 50K+ books, e-books, study rooms (Mon-Fri 9AM-5PM)
👥 Membership: Students ₱200/yr, Regular ₱500/yr, Researchers ₱800/yr
📖 Borrowing: Members 5books/2wks, Students 3books/1wk, ₱5/day overdue
🔍 Research: Databases, consultation, citation help
📜 Archives: Historical docs, Manila records, digitization
🏛️ Museum: Quarterly exhibitions, tours, education programs
📞 Contact: info@clams.edu.ph | (02) 8123-4567
`;
  }

  async generateResponse(userInput, context = "") {
    if (!this.apiKey) {
      return this.getFallbackResponse(userInput);
    }

    // Determine query complexity for model selection
    const isSimpleQuery = this.isSimpleQuery(userInput);
    const isVerySimple = this.isVerySimpleQuery(userInput);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          // Use faster models for simpler queries
          model: isVerySimple ? "openai/gpt-3.5-turbo" : 
                 isSimpleQuery ? "anthropic/claude-3-haiku" : 
                 "deepseek/deepseek-r1-0528:free",
          messages: [
            {
              role: "system",
              content: isVerySimple ? this.getVerySimplePrompt() :
                       isSimpleQuery ? this.getSimplePrompt() : 
                       this.getComplexPrompt()
            },
            {
              role: "user",
              content: userInput
            }
          ],
          temperature: isSimpleQuery ? 0.3 : 0.7, // Lower temp for faster simple responses
          max_tokens: isVerySimple ? 50 : isSimpleQuery ? 100 : 200, // Shorter responses for speed
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`OpenRouter API Error ${response.status}:`, errorData);
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        console.log("✅ OpenRouter API response received successfully");
        return data.choices[0].message.content;
      } else {
        throw new Error("Invalid response format from OpenRouter");
      }
    } catch (error) {
      console.error("OpenRouter API error:", error);
      
      // Show alert in React Native instead of console
      Alert.alert(
        "Connection Error",
        "Unable to connect to AI service. Using offline responses.",
        [{ text: "OK" }]
      );
      
      return this.getEnhancedFallbackResponse(userInput);
    }
  }

  // NEW: Very simple query detection (for fastest responses)
  isVerySimpleQuery(userInput) {
    const verySimplePatterns = [
      'hours', 'open', 'close', 'contact', 'phone', 'address', 'location',
      'hello', 'hi', 'thanks', 'thank you'
    ];
    
    return verySimplePatterns.some(pattern => 
      userInput.toLowerCase().includes(pattern)
    );
  }

  isSimpleQuery(userInput) {
    const simplePatterns = [
      'fee', 'cost', 'price', 'membership', 'how much', 'borrowing limit',
      'study room', 'wifi', 'computer', 'renewal'
    ];
    
    return simplePatterns.some(pattern => 
      userInput.toLowerCase().includes(pattern)
    );
  }

  // NEW: Optimized prompts for different query types
  getVerySimplePrompt() {
    return `You are De Mallaca, CLAMS librarian. Give direct, factual answers in under 30 words.

${this.getOptimizedCLAMSKnowledge()}`;
  }

  getSimplePrompt() {
    return `You are De Mallaca, CLAMS librarian. Give helpful, direct answers in under 75 words.

${this.getOptimizedCLAMSKnowledge()}`;
  }

  getComplexPrompt() {
    return `You are De Mallaca, CLAMS expert librarian. Provide comprehensive help with step-by-step guidance.

RESPONSE STYLE: Direct answer → specific details → helpful next steps → follow-up question
Keep under 150 words but thorough.

${this.getOptimizedCLAMSKnowledge()}`;
  }

  getFallbackResponse(userInput) {
    const input = userInput.toLowerCase();
    
    const libraryKeywords = [
      'clams', 'library', 'archives', 'museum', 'books', 'book', 'member', 'membership',
      'exhibition', 'research', 'documents', 'records', 'borrow', 'lending', 'study',
      'reading', 'collection', 'catalog', 'database', 'journal', 'article', 'thesis',
      'dissertation', 'reference', 'librarian', 'hours', 'schedule', 'location',
      'contact', 'reservation', 'renewal', 'overdue', 'fine', 'digital', 'ebook',
      'manuscript', 'rare', 'special', 'filipiniana', 'historical', 'preservation'
    ];
    
    const isLibraryRelated = libraryKeywords.some(keyword => input.includes(keyword));
    
    if (!isLibraryRelated && !input.includes('hello') && !input.includes('hi')) {
      return "Hello! I'm De Mallaca, your dedicated CLAMS librarian assistant. I specialize in helping with library services, research resources, book recommendations, study facilities, and all things related to our Library, Archives, and Museum. How can I assist you with your information needs today? 📚";
    }
    
    if (input.includes('hours') || input.includes('open') || input.includes('schedule')) {
      return "⏰ CLAMS Library Hours:\n📅 Monday-Friday: 9:00 AM - 5:00 PM\n📅 Study rooms available until 8:00 PM\n📅 24/7 digital access for members\n\nSpecial holiday hours may vary. Would you like information about weekend programs or extended study hours during exam periods?";
    }
    
    if (input.includes('borrow') || input.includes('loan') || input.includes('checkout')) {
      return "📖 Borrowing Information:\n• Members: 5 books for 2 weeks\n• Students: 3 books for 1 week\n• Faculty: 10 books for 1 month\n• Renewals: Once if no holds\n• Overdue: ₱5/day per book\n\nYou can renew online or by phone. Need help with reservations or checking your account status?";
    }
    
    return "I'm De Mallaca, your expert CLAMS librarian! 📚 I can help you with:\n\n🔍 Finding & borrowing books\n💻 Digital resources & databases\n📚 Study spaces & reservations\n🎓 Research assistance & tutorials\n👥 Membership & account services\n📜 Archives & historical research\n🏛️ Museum exhibitions & programs\n\nWhat would you like to explore at CLAMS today? I'm here to make your library experience amazing!";
  }

  // NEW: More detailed fallback responses
  getEnhancedFallbackResponse(userInput) {
    const input = userInput.toLowerCase();
    
    // Enhanced pattern matching with better responses
    if (input.includes('hours') || input.includes('open')) {
      return `⏰ **CLAMS Operating Hours**

🏛️ **Main Library:** Monday-Friday, 9:00 AM - 5:00 PM
📚 **Study Rooms:** Available until 8:00 PM (Mon-Fri)
💻 **Digital Access:** 24/7 for members
🏛️ **Archives & Museum:** Monday-Friday, 9:00 AM - 5:00 PM

📅 **Special Hours:**
• Holiday schedules may vary
• Extended hours during exam periods
• Weekend programs by appointment

📞 **Need to confirm hours?** Call (02) 8123-4567

❓ **What specific service hours do you need?**`;
    }

    if (input.includes('borrow') || input.includes('checkout')) {
      return `📖 **How to Borrow Books from CLAMS**

**📋 Requirements:**
✅ Valid CLAMS membership
✅ Library card & government ID
✅ Account in good standing

**📚 Borrowing Limits:**
• **Students:** 3 books for 1 week
• **Regular Members:** 5 books for 2 weeks  
• **Faculty/Researchers:** 10 books for 1 month

**🔄 Renewals:** Once per item (if no holds)
**💰 Overdue Fine:** ₱5 per day per book

**📞 Need help?** Visit the circulation desk or call (02) 8123-4567

❓ **Would you like to know about book reservations or renewals?**`;
    }

    // Add more enhanced patterns...
    
    return this.getDefaultEnhancedResponse();
  }

  getDefaultEnhancedResponse() {
    return "I'm De Mallaca, your expert CLAMS librarian! 📚 I can help you with:\n\n🔍 Finding & borrowing books\n💻 Digital resources & databases\n📚 Study spaces & reservations\n🎓 Research assistance & tutorials\n👥 Membership & account services\n📜 Archives & historical research\n🏛️ Museum exhibitions & programs\n\nWhat would you like to explore at CLAMS today? I'm here to make your library experience amazing!";
  }

  // React Native specific methods
  async saveToStorage(key, value) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  async getFromStorage(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Error getting from storage:', error);
      return null;
    }
  }

  async clearStorage() {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
}

export default new DeepSeekService();