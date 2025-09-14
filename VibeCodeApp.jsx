import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// DO NOT MODIFY THESE GLOBAL VARIABLES
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Initialize Firebase App
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Log level for Firebase to see debug info in console
import { setLogLevel } from 'firebase/firestore';
setLogLevel('debug');

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vibe, setVibe] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [inputImage, setInputImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Authentication and Data Listener
  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        console.log('User is signed in:', currentUser.uid);
        // Once authenticated, set up the Firestore listener for user's data
        const userVibeDocRef = doc(db, `/artifacts/${appId}/users/${currentUser.uid}/vibeData/current`);
        const unsubscribeSnapshot = onSnapshot(userVibeDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            setVibe(data.text || '');
            console.log('User vibe data loaded:', data);
          } else {
            setVibe('');
            console.log('No vibe data found for this user.');
          }
        });
        // Cleanup the snapshot listener when the user logs out
        return () => unsubscribeSnapshot();
      } else {
        console.log('User is signed out.');
        setUser(null);
        setVibe('');
      }
      setLoading(false);
    });

    // Handle initial authentication
    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Firebase sign-in failed:', error);
        setMessage('Error signing in. Check the console for details.');
      }
    };
    signIn();

    // Cleanup the auth listener
    return () => unsubscribeAuth();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setMessage('Successfully signed out.');
      // Clear images on sign out
      setInputImage(null);
      setGeneratedImage(null);
    } catch (error) {
      console.error('Sign out error:', error);
      setMessage('Error signing out. Check the console for details.');
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImage(reader.result);
      };
      reader.readAsDataURL(file);
      setMessage('Image uploaded. Now add a prompt and enhance!');
    }
  };

  const handleEnhancePhoto = async () => {
    if (!user || !inputImage || !vibe) {
      setMessage('Please sign in, upload a photo, and write a prompt.');
      return;
    }
    setIsEnhancing(true);
    setGeneratedImage(null); // Clear previous result
    setMessage('Enhancing photo...');

    const prompt = vibe;
    const base64ImageData = inputImage.split(',')[1];
    
    // Store prompt in Firestore
    try {
      const userVibeDocRef = doc(db, `/artifacts/${appId}/users/${user.uid}/vibeData/current`);
      await setDoc(userVibeDocRef, {
        text: vibe,
        lastUpdated: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving prompt:', error);
    }
    
    // API call to generate image
    try {
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 1000;

      const fetchWithRetry = async () => {
        try {
          const payload = {
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: base64ImageData
                    }
                  }
                ]
              }
            ],
          };
          const apiKey = "";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`API request failed with status: ${response.status}`);
          }

          const result = await response.json();
          const base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

          if (!base64Data) {
            throw new Error('API response did not contain image data.');
          }
          setGeneratedImage(`data:image/png;base64,${base64Data}`);
          setMessage('Photo enhanced successfully!');
        } catch (error) {
          console.error('API call error:', error);
          if (retryCount < maxRetries) {
            retryCount++;
            await new Promise(res => setTimeout(res, retryDelay * (2 ** (retryCount - 1))));
            await fetchWithRetry();
          } else {
            setMessage('Failed to enhance photo. Check the console for details.');
          }
        }
      };
      await fetchWithRetry();

    } catch (error) {
      console.error('Error in API logic:', error);
      setMessage('An error occurred during enhancement. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  // UI for a placeholder payment page
  const renderPaymentPage = () => (
    <div className="p-8 space-y-4">
      <h2 className="text-2xl font-bold">Upgrade Your Account</h2>
      <p className="text-gray-600">
        This is where you would integrate a payment system like Stripe to handle monthly subscriptions.
        This functionality requires a secure backend server and is not included in this single-file app.
      </p>
      <button
        className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-300"
        disabled
      >
        Subscribe Now (Placeholder)
      </button>
      <p className="mt-4 text-sm text-gray-500">
        To build this, you would use a service like Stripe and a secure server to manage customer payments and subscriptions.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center justify-center font-sans antialiased">
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css" />

      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl border-t-8 border-indigo-500">
        <header className="flex justify-between items-center mb-6 border-b pb-4">
          <h1 className="text-4xl font-extrabold text-gray-900">
            Vibe<span className="text-indigo-600">Code</span>
          </h1>
          {loading ? (
            <div className="text-gray-500 animate-pulse">Initializing...</div>
          ) : user ? (
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-500">
                User ID: <span className="text-gray-800 font-mono text-xs break-all">{user.uid}</span>
              </span>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-rose-500 text-white font-medium rounded-full shadow-sm hover:bg-rose-600 transition duration-300"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <span className="text-sm text-gray-500">Not signed in</span>
          )}
        </header>

        {message && (
          <div className="bg-gray-100 text-gray-800 p-3 mb-4 rounded-lg text-sm text-center">
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <i className="fas fa-spinner fa-spin text-4xl text-indigo-500"></i>
          </div>
        ) : (
          <main className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="image-upload" className="block text-lg font-medium text-gray-700">
                Upload Your Photo
              </label>
              <input 
                id="image-upload" 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
              />
              {inputImage && (
                <div className="mt-4 flex flex-col items-center">
                  <h3 className="text-md font-medium text-gray-700 mb-2">Original Image:</h3>
                  <img src={inputImage} alt="Uploaded" className="rounded-lg shadow-md max-w-full h-auto" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="vibe-input" className="block text-lg font-medium text-gray-700">
                Enter Your Vibe Prompt
              </label>
              <textarea
                id="vibe-input"
                className="w-full h-24 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 shadow-sm"
                placeholder="Describe how you want to enhance the photo (e.g., 'A vibrant watercolor painting with a mystical aura')"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
              />
            </div>

            <div className="flex justify-end space-x-4">
              <button
                onClick={handleEnhancePhoto}
                className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-full shadow-md hover:bg-indigo-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!user || isEnhancing || !inputImage || !vibe}
              >
                {isEnhancing ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i> Enhancing...
                  </>
                ) : (
                  'Enhance Photo'
                )}
              </button>
            </div>
            
            {generatedImage && (
              <div className="mt-8 flex flex-col items-center">
                <h3 className="text-md font-medium text-gray-700 mb-2">Enhanced Image:</h3>
                <img src={generatedImage} alt="Generated" className="rounded-lg shadow-md max-w-full h-auto" />
              </div>
            )}
            
            <section className="mt-8">
              {renderPaymentPage()}
            </section>
          </main>
        )}
      </div>

      <footer className="mt-8 text-sm text-gray-500 text-center">
        Powered by React and Firebase. Data is securely stored under your unique user ID.
      </footer>
    </div>
  );
};

export default App;
