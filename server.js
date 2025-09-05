import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fileUpload from 'express-fileupload';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { updateMaterialStatuses } from './utils/materialStatusUpdater.js';
import { updateOverdueStatus, checkUnclaimedRequests } from './utils/borrowUtils.js'

// 🛠️ Fix: Define __dirname early
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment configuration
import { getEnvironmentConfig } from './config/environment.js';

// Routes - Import all routes to match the first server
import authRoutes from './routes/auth.js';
import learnMatRoutes from './routes/learningmat.js';
import archiveRequestRoutes from './routes/archiveRequest.js';
import roomReservationRoutes from './routes/roomReservation.js';
import reserveRoutes from './routes/reserve.js';
import borrowRoutes from './routes/borrow.js';
import feedbackRoutes from './routes/feedback.js';
import bookRatingRoutes from './routes/bookrating.js'
import userRoutes from './routes/users.js'
import notificationRoutes from './routes/notifications.js'


// Initialize app
dotenv.config();
const app = express();

// Get environment configuration
const config = getEnvironmentConfig();

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Log server configuration
console.log('🚀 Server Configuration:');
console.log(`📍 Location: ${config.location}`);
console.log(`🌐 Local IP: ${config.localIP}`);
console.log(`🔗 API URL: ${config.apiUrl}`);
console.log(`🗄️ MongoDB: ${config.mongoUri ? 'Configured' : 'Not configured'}`);
console.log(`📧 Brevo API: ${config.brevoApiKey ? 'Configured' : 'Not configured'}`);

// Middleware with dynamic CORS origins
app.use(cors({
  origin: config.corsOrigins, // Use your configured origins
  credentials: true, // Important for maintaining sessions
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: 'File size exceeds the 5MB limit',
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Database connection
mongoose.connect(config.mongoUri, {
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1); // Exit if can't connect
    });

mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB');

    // Check overdue status every hour
    setInterval(updateOverdueStatus, 60 * 60 * 1000);
    setInterval(updateMaterialStatuses, 60 * 60 * 1000); // Run every hour
    updateMaterialStatuses(); // Also run on startup
    setInterval(checkUnclaimedRequests, 60 * 60 * 1000); // Run every hour
    checkUnclaimedRequests(); // Run on startup

    // Also run immediately on startup
    updateOverdueStatus();
});

// API Routes - Match all routes from the first server
app.use('/', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/learnmat', learnMatRoutes);
app.use('/api/archive-requests', archiveRequestRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/room-reservations', roomReservationRoutes);
app.use('/api/reserve-requests', reserveRoutes);
app.use('/api/borrow-requests', borrowRoutes);
app.use('/api/feedback', feedbackRoutes); // Keep your existing route
app.use('/api/ratings', bookRatingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notification', notificationRoutes);




// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});



const PORT = process.env.PORT || config.port || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});


// Export config for use in other files if needed
export { config };