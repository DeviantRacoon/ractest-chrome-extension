import ReactMarkdown from "react-markdown";
import { Modal } from "./ui";

interface MarkdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export const MarkdownModal: React.FC<MarkdownModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="markdown-body prose dark:prose-invert max-w-none text-sm">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-secondary transition-colors"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
};
