import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton() {
  const navigate = useNavigate();
  return (
    <button className="back-btn" onClick={() => navigate(-1)} aria-label="Go back">
      <ArrowLeft size={18} />
      <span>Back</span>
    </button>
  );
}
