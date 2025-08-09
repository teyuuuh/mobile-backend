  const getEnvironmentConfig = () => {
    const location = process.env.LOCATION || 'home';
    
    const getLocalIP = () => {
      if (location === 'school') {
        return '192.168.43.135';
      }
      // Replace this with your ACTUAL home IP address
      return '192.168.1.2'; // Update this to your real IP
    };
    
    const localIP = getLocalIP();
    
    const configs = {
      home: {
        apiUrl: `http://192.168.1.2:3000`,
        localIP: '192.168.1.2',
        corsOrigins: [
          'http://localhost:3000',
          'http://10.0.2.2:3000',
          `http://${localIP}:3000`,
          `exp://${localIP}:19000`,
          '*'
        ]
      },
      school: {
        apiUrl: 'http://192.168.43.135:3000',
        localIP: '192.168.43.135',
        corsOrigins: [
          'http://localhost:3000', 
          'http://10.0.2.2:3000', 
          'http://192.168.43.135:3000', 
          'exp://192.168.43.135:19000'
        ]
      }
    };
    
    const config = configs[location] || configs.home;
    
    return {
      location,
      ...config,
      mongoUri: process.env.MONGO_URI,
      port: process.env.PORT || 3000,
      brevoApiKey: process.env.BREVO_API_KEY,
      jwtSecret: process.env.JWT_SECRET
    };
  };

  export { getEnvironmentConfig };