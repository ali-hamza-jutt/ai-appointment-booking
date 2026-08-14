import type { ConversationViewModel } from "@/features/conversations/types/conversation-ui";

export const conversationPreviews: ConversationViewModel[] = [
  {
    dateLabel: "Today, 10:04 AM",
    id: "project-consultation",
    messages: [
      {
        id: "project-1",
        role: "assistant",
        text: "Hi Jordan! Tell me what you would like to schedule.",
        time: "10:02 AM",
      },
      {
        id: "project-2",
        role: "user",
        text: "Book a 30-minute project consultation next Tuesday at 10 AM.",
        time: "10:03 AM",
      },
      {
        id: "project-3",
        role: "assistant",
        text: "Your project consultation is ready for review. I used your default timezone, Asia/Karachi.",
        time: "10:04 AM",
      },
    ],
    preview: "Your project consultation is ready for review…",
    statusLabel: "Appointment booked",
    title: "Project consultation",
  },
  {
    dateLabel: "July 30, 2026",
    id: "quarterly-planning",
    messages: [
      {
        id: "planning-1",
        role: "user",
        text: "I need a quarterly planning session Thursday afternoon.",
        time: "3:24 PM",
      },
      {
        id: "planning-2",
        role: "assistant",
        text: "I scheduled a 45-minute quarterly planning session for 3:30 PM.",
        time: "3:26 PM",
      },
    ],
    preview: "I scheduled a 45-minute planning session…",
    statusLabel: "Appointment completed",
    title: "Quarterly planning session",
  },
  {
    dateLabel: "July 22, 2026",
    id: "follow-up",
    messages: [
      {
        id: "follow-up-1",
        role: "user",
        text: "Can you arrange a follow-up call for Wednesday at 11 AM?",
        time: "9:40 AM",
      },
      {
        id: "follow-up-2",
        role: "assistant",
        text: "The follow-up call was created and later cancelled.",
        time: "9:42 AM",
      },
    ],
    preview: "The follow-up call was created and later cancelled.",
    statusLabel: "Appointment cancelled",
    title: "Follow-up call",
  },
];

export function findConversationPreview(id: string) {
  return conversationPreviews.find((conversation) => conversation.id === id);
}
