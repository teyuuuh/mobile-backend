const getEnvironmentConfig = () => {
  const location = process.env.LOCATION || 'production';

  const getLocalIP = () => {
    if (location === 'school') {
      return '192.168.43.135';
    }
    return '192.168.1.2'; // home IP
  };

  const localIP = getLocalIP();

  const configs = {
    home: {
      apiUrl: `http://${localIP}:3000`,
      localIP,
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
    },
    production: {
      apiUrl: 'https://mobile-backend-aftl.onrender.com',
      corsOrigins: [
        'https://mobile-backend-aftl.onrender.com',
        '*'
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
