'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateProfile } from '@/lib/actions/auth.actions';
import { toast } from 'sonner';

interface EditProfileModalProps {
    user: User;
    open: boolean;
    setOpen: (open: boolean) => void;
}

export default function EditProfileModal({ user, open, setOpen }: EditProfileModalProps) {
    const [name, setName] = useState(user.name);
    const [image, setImage] = useState(user.image || '');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Please select an image file');
                return;
            }
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                toast.error('Image size should be less than 2MB');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await updateProfile({ name, image });
            if (result.success) {
                toast.success('Profile updated successfully');
                setOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to update profile');
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[425px] bg-[#1C1F26] border-gray-800 text-gray-200">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">Edit Profile</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-gray-400">Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-gray-200 focus-visible:ring-yellow-500"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="image" className="text-gray-400">Profile Picture</Label>
                        <Input
                            id="image"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="bg-gray-800 border-gray-700 text-gray-200 focus-visible:ring-yellow-500 cursor-pointer file:text-gray-200 file:bg-gray-700 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-md hover:file:bg-gray-600"
                        />
                        {image && (
                            <div className="mt-2 flex justify-center">
                                <img
                                    src={image}
                                    alt="Profile Preview"
                                    className="h-16 w-16 rounded-full object-cover border border-gray-700"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            className="text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-yellow-500 text-yellow-950 hover:bg-yellow-400"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
