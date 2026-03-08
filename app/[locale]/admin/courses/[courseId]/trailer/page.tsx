'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { instructorApi } from '@/lib/api/instructor';
import { toast } from 'sonner';
import { Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

export default function TrailerConfigPage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [trailerEnabled, setTrailerEnabled] = useState(false);
  const [allLectures, setAllLectures] = useState<{ id: string; title: string; order: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await instructorApi.getTrailerConfig(courseId);
        setTrailerEnabled(data.trailerEnabled);
        setAllLectures(data.allLectures);
        setSelectedIds(data.selectedLectureIds);
      } catch {
        toast.error('Failed to load trailer config');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [courseId]);

  const toggleLecture = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await instructorApi.updateTrailerConfig(courseId, {
        trailerEnabled,
        lectureIds: selectedIds
      });
      toast.success('Trailer saved');
    } catch {
      toast.error('Failed to save trailer');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Course Trailer</h2>
        <p className="text-muted-foreground">
          Select which lectures appear in the free trailer. Students with verified email can watch without enrolling.
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-semibold">Enable Trailer</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, verified students can access the trailer page
              </p>
            </div>
            <div className="flex items-center gap-3">
              {trailerEnabled
                ? <Badge variant="default" className="bg-green-500">Active</Badge>
                : <Badge variant="secondary">Disabled</Badge>
              }
              <Switch checked={trailerEnabled} onCheckedChange={setTrailerEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lecture Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Trailer Lectures</CardTitle>
          <CardDescription>
            {selectedIds.length} of {allLectures.length} lectures selected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allLectures.length === 0 && (
            <p className="text-muted-foreground text-center py-6">
              No lectures yet. Add lectures to the curriculum first.
            </p>
          )}
          {allLectures.map((lecture, index) => (
            <div
              key={lecture.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                ${selectedIds.includes(lecture.id)
                  ? 'bg-primary/5 border-primary/30'
                  : 'bg-card hover:bg-muted/50'
                }`}
              onClick={() => toggleLecture(lecture.id)}
            >
              <Checkbox
                checked={selectedIds.includes(lecture.id)}
                onCheckedChange={() => toggleLecture(lecture.id)}
                onClick={e => e.stopPropagation()}
              />
              <div className="flex-1">
                <div className="font-medium">{lecture.title}</div>
                <div className="text-xs text-muted-foreground">Lecture {index + 1}</div>
              </div>
              {selectedIds.includes(lecture.id) && (
                <Badge variant="outline" className="text-primary border-primary/40">
                  In Trailer
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Trailer URL Preview */}
      {trailerEnabled && selectedIds.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
              <Eye className="h-4 w-4" />
              <span>Trailer URL: </span>
              <code className="font-mono text-xs bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded">
                /courses/{courseId}/trailer
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save Trailer Config
      </Button>
    </div>
  );
}
