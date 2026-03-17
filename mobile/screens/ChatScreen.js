import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';

// ─── Config ──────────────────────────────────────────────────────────────────
// Change this to your machine's local IP when running on a physical device.
// e.g. 'http://192.168.1.42:3000'
// On Android emulator use: 'http://10.0.2.2:3000'
// On iOS simulator 'http://localhost:3000' works fine.
const API_BASE = 'http://localhost:192.168.1.105';

// ─── Helpers ─────────────────────────────────────────────────────────────────
let messageIdCounter = 0;
const uid = () => String(++messageIdCounter);

// ─── Component ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [displayMessages, setDisplayMessages] = useState([
    {
      id: uid(),
      role: 'assistant',
      text: "Let's get to work. Tell me your name and what you're training for.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');

    const userMsgId = uid();
    const newHistory = [...conversationHistory, { role: 'user', content: text }];

    setDisplayMessages((prev) => [...prev, { id: userMsgId, role: 'user', text }]);
    setConversationHistory(newHistory);
    setIsLoading(true);
    scrollToBottom();

    // Placeholder bubble for streaming response
    const assistantId = uid();
    setDisplayMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', text: '' },
    ]);

    let fullText = '';

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'delta') {
            fullText += event.text;
            const snapshot = fullText;
            setDisplayMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, text: snapshot } : m)
            );
            scrollToBottom();
          } else if (event.type === 'done') {
            break;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }

      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: fullText },
      ]);
    } catch (err) {
      setDisplayMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: 'Something went wrong. Check the backend and try again.', isError: true }
            : m
        )
      );
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  }, [input, isLoading, conversationHistory, scrollToBottom]);

  const renderMessage = useCallback(({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowCoach]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>G</Text>
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleCoach,
          item.isError && styles.bubbleError,
        ]}>
          {item.text === '' && !isUser ? (
            <ActivityIndicator size="small" color="#555" />
          ) : (
            <Text style={[styles.bubbleText, isUser ? styles.textUser : styles.textCoach]}>
              {item.text}
            </Text>
          )}
        </View>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GRIT</Text>
          <Text style={styles.headerSub}>AI COACH</Text>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Log a set, ask a question..."
            placeholderTextColor="#3a3a3a"
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.7}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#000" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a',
  surface: '#111',
  border: '#1e1e1e',
  accent: '#e8ff00',
  userBubble: '#1c1c1c',
  coachBubble: '#141414',
  text: '#efefef',
  muted: '#666',
  error: '#ff4040',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: C.accent,
    letterSpacing: 5,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 3,
  },

  list: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  rowUser: { justifyContent: 'flex-end' },
  rowCoach: { justifyContent: 'flex-start' },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '900', color: '#000' },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleUser: {
    backgroundColor: C.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    backgroundColor: C.coachBubble,
    borderBottomLeftRadius: 4,
  },
  bubbleError: { borderColor: C.error },

  bubbleText: { fontSize: 15, lineHeight: 22 },
  textUser: { color: C.text },
  textCoach: { color: C.text },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  input: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.text,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#222' },
  sendBtnText: { fontSize: 18, fontWeight: '700', color: '#000' },
});
