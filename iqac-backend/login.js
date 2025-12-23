const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false }
  }
)

// SEND OTP - Only if email exists in profiles table
async function sendOTP(email) {
  try {
    // Validate input
    if (!email) {
      return { success: false, message: "Email is required" }
    }

    // Normalize email
    email = email.toLowerCase().trim()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return {
        success: false,
        message: 'Invalid email format'
      }
    }

    // ⭐ FIRST: Check if email exists in profiles table
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, role')
      .eq('email', email)
      .single()

    // ⭐ If email NOT found in profiles - STOP and return error
    if (profileError || !existingProfile) {
      console.log(`Access denied for email: ${email} - Not found in profiles`)
      return {
        success: false,
        message: 'This email is not registered in the system. Please contact your administrator.'
      }
    }

    // ⭐ Email exists in profiles - NOW send OTP
    console.log(`Email verified: ${existingProfile.name} (${existingProfile.role})`)

    const { data, error } = await supabase.auth.signInWithOtp({ email })

    if (error) {
      console.log("Supabase OTP error:", error)
      return { 
        success: false, 
        message: "Failed to send OTP. Please try again." 
      }
    }

    return { 
      success: true, 
      message: `OTP sent to ${email}` 
    }

  } catch (error) {
    console.error('Error in sendOTP:', error)
    return {
      success: false,
      message: 'Failed to send OTP. Please try again.'
    }
  }
}

// VERIFY OTP
async function verifyOTP(email, otp) {
  try {
    // Normalize inputs
    email = email.toLowerCase().trim()
    otp = otp.trim()

    // Verify OTP with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email"
    })

    if (error) {
      console.log("verifyOTP error:", error)
      return { 
        success: false, 
        message: "Invalid or expired OTP" 
      }
    }

    // Get user profile from DB
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .single()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return {
        success: false,
        message: "Profile not found"
      }
    }

    // Log profile data for debugging (especially school field for Deans)
    console.log('User profile fetched:', {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      school: profile.school,
      department: profile.department
    });

    // Update last_seen_at
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', profile.id)

    return {
      success: true,
      message: "Login successful",
      user: profile,
      session: data.session,
      access_token: data.session?.access_token
    }

  } catch (error) {
    console.error('Error in verifyOTP:', error)
    return {
      success: false,
      message: 'Verification failed. Please try again.'
    }
  }
}

module.exports = {
  sendOTP,
  verifyOTP
}