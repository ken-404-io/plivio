import { useNavigate } from 'react-router-dom';
import ChatTask from '../tasks/ChatTask.tsx';

/**
 * Dedicated /quizly route — renders the Quizly (chat-quiz) experience as
 * a full-screen overlay. Closing it sends the user back to the dashboard.
 */
export default function Quizly() {
  const navigate = useNavigate();
  return <ChatTask onClose={() => navigate('/dashboard')} />;
}
