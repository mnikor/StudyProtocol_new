import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Comment {
  id: number;
  text: string;
  createdAt: string;
  section: string;
  sectionItem: string;
  contextData?: string; // For storing row/cell specific data
}

interface FloatingCommentSystemProps {
  protocolId: string;
  designStateId: string;
  section: string;
  sectionItem: string;
  contextData?: string; // Optional context like "row-3-col-2" or "assessment-vital-signs"
  triggerContent?: React.ReactNode;
  position?: 'bottom-right' | 'top-right' | 'bottom-left';
}

export default function FloatingCommentSystem({
  protocolId,
  designStateId,
  section,
  sectionItem,
  contextData,
  triggerContent,
  position = 'bottom-right'
}: FloatingCommentSystemProps) {
  // Use the more efficient CommentTrigger component instead
  return null;
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [hasLoadedComments, setHasLoadedComments] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for comments - only when opened and haven't loaded yet
  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ['/api/comments', protocolId, designStateId, section, sectionItem, contextData],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/comments/${protocolId}/${designStateId}?section=${section}&sectionItem=${sectionItem}${contextData ? `&contextData=${contextData}` : ''}`);
        if (!response.ok) {
          if (response.status === 404) return [];
          throw new Error(`Failed to fetch comments: ${response.statusText}`);
        }
        const text = await response.text();
        if (!text) return [];
        return JSON.parse(text);
      } catch (error) {
        console.warn('Comment fetch error:', error);
        return [];
      }
    },
    enabled: isOpen && !hasLoadedComments,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to reduce API calls
    refetchOnWindowFocus: false,
  });

  // Load comments when first opened
  useEffect(() => {
    if (isOpen && !hasLoadedComments) {
      setHasLoadedComments(true);
    }
  }, [isOpen, hasLoadedComments]);

  // Mutation for adding comments
  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => {
      try {
        const response = await apiRequest('POST', `/api/comments/${protocolId}/${designStateId}`, {
          content: commentText, // Match the expected field name
          section,
          sectionItem,
          contextData
        });
        return response.json();
      } catch (error) {
        console.error('Comment creation error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comments', protocolId, designStateId] });
      setNewComment('');
      toast({
        title: 'Comment Added',
        description: 'Your comment has been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle adding a comment
  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  // Get position styles
  const getPositionStyles = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'bottom-4 right-4';
    }
  };

  // Get comment count for this specific context
  const commentCount = comments.filter(comment => 
    comment.section === section && 
    comment.sectionItem === sectionItem &&
    comment.contextData === contextData
  ).length;

  if (!isOpen) {
    return (
      <div className={`fixed ${getPositionStyles()} z-50`}>
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white shadow-lg"
          size="sm"
        >
          {triggerContent || (
            <div className="relative">
              <MessageCircle size={20} />
              {commentCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {commentCount}
                </Badge>
              )}
            </div>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className={`fixed ${getPositionStyles()} z-50`}>
      <Card className={`shadow-xl border-2 bg-white transition-all duration-300 ${
        isExpanded ? 'w-80 h-96' : 'w-80 h-16'
      }`}>
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageCircle size={16} className="text-blue-500" />
              Comments
              {commentCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {commentCount}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-7 w-7 p-0"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0"
              >
                <X size={14} />
              </Button>
            </div>
          </div>
          {contextData && (
            <p className="text-xs text-gray-500 mt-1">
              Context: {contextData.replace(/-/g, ' ')}
            </p>
          )}
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="p-3 pt-0 flex flex-col h-80">
            {/* Comments List */}
            <ScrollArea className="flex-1 mb-3">
              {isLoading ? (
                <div className="text-center text-sm text-gray-500 py-4">Loading comments...</div>
              ) : comments.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-4">
                  No comments yet. Be the first to add one!
                </div>
              ) : (
                <div className="space-y-2">
                  {comments.map((comment) => (
                    <div key={comment.id} className="p-2 bg-gray-50 rounded text-sm">
                      <p className="text-gray-800 mb-1">{comment.text}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(comment.createdAt).toLocaleDateString()} at{' '}
                        {new Date(comment.createdAt).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Add Comment */}
            <div className="space-y-2">
              <Textarea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  size="sm"
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {addCommentMutation.isPending ? (
                    <>Adding...</>
                  ) : (
                    <>
                      <Send size={14} className="mr-1" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Mini comment trigger for specific cells/rows
interface CommentTriggerProps {
  protocolId: string;
  designStateId: string;
  section: string;
  sectionItem: string;
  contextData: string;
  className?: string;
}

export function CommentTrigger({
  protocolId,
  designStateId,
  section,
  sectionItem,
  contextData,
  className = ""
}: CommentTriggerProps) {
  const [showComments, setShowComments] = useState(false);

  // Query for comment count
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['/api/comments', protocolId, designStateId, section, sectionItem, contextData],
    queryFn: async () => {
      const response = await fetch(`/api/comments/${protocolId}/${designStateId}?section=${section}&sectionItem=${sectionItem}&contextData=${contextData}`);
      if (!response.ok) return [];
      return response.json();
    },
  });

  const commentCount = comments.length;

  return (
    <>
      <button
        onClick={() => setShowComments(true)}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs transition-all hover:bg-blue-100 ${
          commentCount > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
        } ${className}`}
      >
        {commentCount > 0 ? commentCount : <Plus size={12} />}
      </button>

      {showComments && (
        <FloatingCommentSystem
          protocolId={protocolId}
          designStateId={designStateId}
          section={section}
          sectionItem={sectionItem}
          contextData={contextData}
          position="bottom-right"
        />
      )}
    </>
  );
}