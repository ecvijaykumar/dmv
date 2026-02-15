import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { FirebaseRecaptchaVerifierModal } from "expo-firebase-recaptcha";
import * as Google from "expo-auth-session/providers/google";
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  PhoneAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPhoneNumber,
  signOut
} from "firebase/auth";
import { firebaseConfig, googleOAuth } from "./firebaseConfig";

const API_BASE_URL = "http://localhost:4000";

type Session = {
  id: string;
  profileId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  timeOfDay: "day" | "night";
  weather: string;
  notes: string;
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default function App() {
  const recaptchaVerifier = useMemo(() => ({ current: null }), []);
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState("teen-1");
  const [date, setDate] = useState("2026-02-15");
  const [startTime, setStartTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: googleOAuth.expoClientId,
    iosClientId: googleOAuth.iosClientId,
    androidClientId: googleOAuth.androidClientId,
    webClientId: googleOAuth.webClientId
  });

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (response?.type !== "success") return;

    const idToken = response.authentication?.idToken;
    if (!idToken) {
      Alert.alert("Error", "Google sign-in did not return an ID token.");
      return;
    }

    signInWithCredential(auth, GoogleAuthProvider.credential(idToken)).catch((error) => {
      Alert.alert("Error", error.message || "Google sign-in failed");
    });
  }, [response]);

  async function authHeader() {
    if (!auth.currentUser) throw new Error("Sign in required");
    const token = await auth.currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }

  async function loadSessions() {
    if (!auth.currentUser) {
      setSessions([]);
      return;
    }
    const headers = await authHeader();
    const response = await fetch(
      `${API_BASE_URL}/api/sessions?profileId=${encodeURIComponent(profileId)}`,
      { headers }
    );
    const json = await response.json();
    setSessions(json.sessions || []);
  }

  useEffect(() => {
    loadSessions().catch(() => Alert.alert("Error", "Failed to load sessions"));
  }, [profileId, user]);

  async function sendOtp() {
    if (!phoneNumber) {
      Alert.alert("Error", "Enter phone number in E.164 format, e.g. +14085551234");
      return;
    }

    try {
      const confirmation = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        recaptchaVerifier.current as never
      );
      setVerificationId(confirmation.verificationId);
      Alert.alert("OTP sent", "Check your phone and enter the OTP code.");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Unable to send OTP");
    }
  }

  async function verifyOtp() {
    if (!verificationId) {
      Alert.alert("Error", "Send OTP first");
      return;
    }

    try {
      const credential = PhoneAuthProvider.credential(verificationId, otpCode);
      await signInWithCredential(auth, credential);
      setOtpCode("");
      setVerificationId("");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Invalid OTP");
    }
  }

  async function addSession() {
    const headers = await authHeader();
    const payload = {
      profileId,
      date,
      startTime,
      durationMinutes: Number(durationMinutes),
      timeOfDay: "day",
      weather: "clear",
      notes: "Logged from mobile"
    };

    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      Alert.alert("Error", error.error || "Unable to save session");
      return;
    }

    await loadSessions();
  }

  return (
    <SafeAreaView style={styles.container}>
      <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebaseConfig} />

      <Text style={styles.title}>T-Drive App</Text>
      <Text style={styles.subtitle}>Secure multi-user login (Google or phone OTP)</Text>

      <View style={styles.authCard}>
        <Text style={styles.sectionTitle}>Authentication</Text>
        <Text style={styles.statusText}>{user ? `Signed in: ${user.email || user.phoneNumber || user.uid}` : "Not signed in"}</Text>
        <Button
          title="Sign in with Google"
          disabled={!request}
          onPress={() => promptAsync().catch(() => Alert.alert("Error", "Google sign-in failed"))}
        />

        <TextInput style={styles.input} value={phoneNumber} onChangeText={setPhoneNumber} placeholder="+14085551234" />
        <Button title="Send OTP" onPress={() => sendOtp().catch(() => Alert.alert("Error", "Failed to send OTP"))} />

        <TextInput style={styles.input} value={otpCode} onChangeText={setOtpCode} placeholder="OTP code" />
        <Button title="Verify OTP" onPress={() => verifyOtp().catch(() => Alert.alert("Error", "OTP verification failed"))} />

        {user ? <Button title="Sign out" onPress={() => signOut(auth)} /> : null}
      </View>

      <View style={styles.authCard}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <TextInput style={styles.input} value={profileId} onChangeText={setProfileId} placeholder="Driver profile ID" />
      </View>

      {user ? (
        <>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="HH:mm" />
          <TextInput
            style={styles.input}
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            placeholder="Duration in minutes"
            keyboardType="numeric"
          />

          <Button title="Add Session" onPress={() => addSession().catch(() => Alert.alert("Error", "Could not add session"))} />
        </>
      ) : null}

      <FlatList
        style={styles.list}
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item.date} {item.startTime}</Text>
            <Text style={styles.rowText}>Profile: {item.profileId}</Text>
            <Text style={styles.rowText}>{item.durationMinutes} min</Text>
          </View>
        )}
      />

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f9ff",
    padding: 16,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  subtitle: {
    fontSize: 14,
    color: "#4c607a",
    marginBottom: 6
  },
  authCard: {
    borderWidth: 1,
    borderColor: "#d5e1f2",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    gap: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600"
  },
  statusText: {
    fontSize: 13,
    color: "#334862"
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd8ec",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  list: {
    marginTop: 10
  },
  row: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9e3f0",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  rowText: {
    fontSize: 14
  }
});
