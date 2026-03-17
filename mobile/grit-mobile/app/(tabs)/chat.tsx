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
import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getSessions, getProfile, WorkoutSession, UserProfile } from '@/utils/storage';
import { streamChat, ChatMessage } from '@/utils/api';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
  isStreaming?: boolean;
}

let msgCounter = 0;
const uid = () => String(++msgCounter) + Date.now();

function buildInitialMessage(profile: UserProfile | null): string {
  if (!profile) return "Let's get to work. What are we dealing with today?";
  return `${profile.name}. What are we working on?`;
}

export default function ChatScreen() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initialised, setInitialised] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getSessions(), getProfile()]).then(([s, p]) => {
        setSessions(s);
        setProfile(p);
        if (!initialised) {
          setMessages([
            {
              id: uid(),
              role: 'assistant',
              text: buildInitialMessage(p),
            },
          ]);
          setInitialised(true);
        }
      });
    }, [initialised])
  );

  async function send() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    const newHistory: ChatMessage[] = [...history, { role: 'user', content: text }];
    setHistory(newHistory);
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
    setIsLoading(true);
    scrollToBottom();

    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', text: '', isStreaming: true },
    ]);

    // Use last 10 sessions for context
    const workoutHistory = [...sessions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    let fullText = '';

    await streamChat(
      newHistory,
      workoutHistory,
      (chunk) => {
        fullText += chunk;
        const snapshot = fullText;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: snapshot } : m))
        );
        scrollToBottom();
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );
        setHistory((prev) => [...prev, { role: 'assistant', content: fullText }]);
        setIsLoading(false);
        scrollToBottom();
      },
      (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: `Failed to connect. Is the backend running at 192.168.1.105:3000?\n\n${err}`,
                  isError: true,
                  isStreaming: false,
                }
              : m
          )
        );
        setIsLoading(false);
      }
    );
  }

  const renderMessage = useCallback(
    ({ item }: { item: DisplayMessage }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[msgStyles.row, isUser ? msgStyles.rowUser : msgStyles.rowAssistant]}>
          {!isUser && (
            <View style={msgStyles.avatar}>
              <Text style={msgStyles.avatarText}>G</Text>
            </View>
          )}
          <View
            style={[
              msgStyles.bubble,
              isUser ? msgStyles.bubbleUser : msgStyles.bubbleAssistant,
              item.isError && msgStyles.bubbleError,
            ]}
          >
            {item.isStreaming && item.text === '' ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Text style={[msgStyles.bubbleText, item.isError && msgStyles.errorText]}>
                {item.text}
              </Text>
            )}
          </View>
        </View>
      );
    },
    []
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>GRIT</Text>
          <Text style={styles.logoSub}>AI COACH</Text>
          {sessions.length > 0 && (
            <View style={styles.contextBadge}>
              <Text style={styles.contextText}>{Math.min(sessions.length, 10)} sessions loaded</Text>
            </View>
          )}
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask GRIT anything..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={send}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.background} />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 5,
  },
  logoSub: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 3,
  },
  contextBadge: {
    marginLeft: 'auto',
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  contextText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accent,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: COLORS.text,
    fontSize: FONT_SIZE.md,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  sendBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.background,
  },
});

const msgStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.background,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleUser: {
    backgroundColor: COLORS.surfaceAlt,
    borderBottomRightRadius: RADIUS.xs ?? 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: RADIUS.xs ?? 4,
  },
  bubbleError: {
    borderColor: COLORS.danger,
  },
  bubbleText: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.danger,
  },
});
