/**
 * Structured Error Logging Utility
 * Provides consistent error logging with context across the application
 */

const LOG_LEVELS = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL',
};

class Logger {
    constructor() {
        this.isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';
    }

    /**
     * Format log message with context
     */
    _formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const contextStr = Object.keys(context).length > 0
            ? `\n  Context: ${JSON.stringify(context, null, 2)}`
            : '';

        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    /**
     * Log debug information (development only)
     */
    debug(message, context = {}) {
        if (this.isDevelopment) {
            console.log(this._formatMessage(LOG_LEVELS.DEBUG, message, context));
        }
    }

    /**
     * Log informational messages
     */
    info(message, context = {}) {
        console.log(this._formatMessage(LOG_LEVELS.INFO, message, context));
    }

    /**
     * Log warnings
     */
    warn(message, context = {}) {
        console.warn(this._formatMessage(LOG_LEVELS.WARN, message, context));
    }

    /**
     * Log errors with stack trace
     */
    error(message, error = null, context = {}) {
        const errorContext = {
            ...context,
            ...(error && {
                errorMessage: error.message,
                errorCode: error.code,
                errorDetails: error.details,
                errorHint: error.hint,
                stack: error.stack,
            }),
        };

        console.error(this._formatMessage(LOG_LEVELS.ERROR, message, errorContext));

        // In production, you would send this to an error tracking service like Sentry
        // Example: Sentry.captureException(error, { extra: errorContext });
    }

    /**
     * Log critical errors that require immediate attention
     */
    critical(message, error = null, context = {}) {
        const errorContext = {
            ...context,
            ...(error && {
                errorMessage: error.message,
                errorCode: error.code,
                errorDetails: error.details,
                errorHint: error.hint,
                stack: error.stack,
            }),
        };

        console.error(this._formatMessage(LOG_LEVELS.CRITICAL, message, errorContext));

        // In production, trigger alerts for critical errors
        // Example: Sentry.captureException(error, { level: 'fatal', extra: errorContext });
    }

    /**
     * Log API request/response for debugging
     */
    apiCall(method, endpoint, params = {}, response = null) {
        if (this.isDevelopment) {
            this.debug(`API Call: ${method} ${endpoint}`, {
                params,
                response: response ? {
                    success: response.success,
                    dataLength: response.data?.length
                } : null,
            });
        }
    }

    /**
     * Log user action for analytics
     */
    userAction(action, userId = null, metadata = {}) {
        this.info(`User Action: ${action}`, {
            userId,
            ...metadata,
        });

        // In production, send to analytics service
        // Example: Analytics.track(action, { userId, ...metadata });
    }
}

// Create and export singleton instance
const logger = new Logger();

export default logger;
