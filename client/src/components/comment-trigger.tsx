import React, { useState } from 'react';
import { MessageCircle, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  section: string;
  sectionItem: string;
  contextData?: string;
  resolved?: boolean;
}

interface CommentTriggerProps {
  protocolId: string;
  designStateId: string;
  section: string;
  sectionItem: string;
  contextData?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'icon';
}

export function CommentTrigger({
  protocolId,
  designStateId,
  section,
  sectionItem,
  contextData,
  children,
  size = 'sm'
}: CommentTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query key for this specific context
  const queryKey = ['/api/comments', protocolId, designStateId, section, sectionItem, contextData];

  // Only fetch when popover is opened
  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey,
    queryFn: async () => {
      try {
        const response = await fetch(`/api/comments/${protocolId}/${designStateId}?section=${section}&sectionItem=${sectionItem}${contextData ? `&contextData=${contextData}` : ''}`);
        if (!response.ok) {
          if (response.status === 404) return [];
          throw new Error('Failed to fetch comments');
        }
        return response.json();
      } catch (error) {
        console.warn('Comment fetch error:', error);
        return [];
      }
    },
    enabled: isOpen,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => {
      const response = await apiRequest('POST', `/api/comments/${protocolId}/`, {
        content: commentText,
        section,
        sectionItem,
        contextData,
        designStateId,
        resolved: false
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNewComment('');
      toast({
        title: 'Comment Added',
        description: 'Your comment has been saved.',
      });
    },
    onError: (error: Error) => {
      console.error('Comment error:', error);
      toast({
        title: 'Error',
        description: 'Failed to add comment. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Resolve comment mutation
  const resolveCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await apiRequest('PUT', `/api/comments/${commentId}`, {
        resolved: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Comment Resolved',
        description: 'Comment has been marked as resolved.',
      });
    },
  });

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  const handleResolveComment = (commentId: string) => {
    resolveCommentMutation.mutate(commentId);
  };

  // Get unresolved comments count (only fetch when we have data)
  const unresolvedCount = comments.filter(c => !c.resolved).length;
  const hasComments = unresolvedCount > 0;

  // Custom trigger or default button
  const trigger = children || (
    <Button
      variant={hasComments ? "default" : "ghost"}
      size={size}
      className={`
        relative
        ${hasComments ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'text-gray-400 hover:text-gray-600'}
        ${size === 'icon' ? 'h-6 w-6 p-0' : 'h-7 w-7 p-0'}
      `}
    >
      {hasComments ? (
        <div className="relative">
          <MessageCircle size={size === 'icon' ? 12 : 14} />
          <Badge 
            className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 py-0 min-w-[16px] h-4 rounded-full"
          >
            {unresolvedCount}
          </Badge>
        </div>
      ) : (
        <Plus size={size === 'icon' ? 10 : 12} />
      )}
    </Button>
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80" side="right" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Comments</h4>
            {contextData && (
              <Badge variant="outline" className="text-xs">
                {contextData.replace(/-/g, ' ')}
              </Badge>
            )}
          </div>
          
          {/* Comments List */}
          <ScrollArea className="max-h-48">
            {isLoading ? (
              <div className="text-sm text-gray-500 py-2">Loading...</div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-gray-500 py-2">No comments yet</div>
            ) : (
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div 
                    key={comment.id} 
                    className={`p-2 rounded text-sm border ${
                      comment.resolved ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <p className="mb-1">{comment.content}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                      {!comment.resolved && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResolveComment(comment.id)}
                          className="h-6 text-xs text-green-600 hover:text-green-700"
                        >
                          <Check size={12} className="mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Add Comment */}
          <div className="border-t pt-3 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[60px] text-sm"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={!newComment.trim() || addCommentMutation.isPending}
              >
                Add Comment
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}