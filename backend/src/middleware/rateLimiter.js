const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * General API rate limiter to protect endpoints from abuse.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
});

/**
 * Specific rate limiter for scheduling endpoints to safely ingest bulk scheduling requests.
 */
const scheduleEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60, // up to 60 schedule API calls per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Schedule request rate limit exceeded. Please wait a moment before scheduling more emails.',
  },
});

module.exports = {
  apiLimiter,
  scheduleEndpointLimiter,
};
