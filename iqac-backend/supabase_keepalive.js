const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false
        }
    }
);

/**
 * Sends a lightweight query to Supabase to keep the database active
 * This prevents Supabase from pausing due to inactivity
 */
async function keepAlive() {
    try {
        console.log(`🔄 Sending keep-alive ping to Supabase...`);
        
        // Send a simple query that doesn't impact data
        // Just counts rows in the profiles table (lightweight operation)
        const { data, error } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Keep-alive query failed:', error.message);
            return { success: false, error: error.message };
        }

        const timestamp = new Date().toISOString();
        const readableTime = new Date().toLocaleString();
        console.log(`✓ Supabase keep-alive ping successful at ${readableTime} (${timestamp})`);
        return { success: true, timestamp };
    } catch (error) {
        console.error('❌ Keep-alive error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Starts the keep-alive service that pings Supabase every 10 hours
 * @param {number} intervalHours - Hours between pings (default: 10)
 */
function startKeepAliveService(intervalHours = 10) {
    const intervalMs = intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
    const intervalMinutes = intervalHours * 60;
    
    console.log(`🔄 Starting Supabase keep-alive service...`);
    console.log(`⏰ Will ping Supabase every ${intervalMinutes} minute(s) (${intervalHours} hours)`);
    console.log(`⏱️  Next ping in ${intervalMinutes} minute(s)`);
    
    // Send initial ping
    keepAlive();
    
    // Set up recurring pings
    const intervalId = setInterval(() => {
        console.log(`⏱️  Keep-alive timer triggered (every ${intervalMinutes} minutes)`);
        keepAlive();
    }, intervalMs);
    
    // Return the interval ID so it can be cleared if needed
    return intervalId;
}

/**
 * Stops the keep-alive service
 * @param {NodeJS.Timeout} intervalId - The interval ID returned by startKeepAliveService
 */
function stopKeepAliveService(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
        console.log('⏹️  Supabase keep-alive service stopped');
    }
}

module.exports = {
    keepAlive,
    startKeepAliveService,
    stopKeepAliveService
};
