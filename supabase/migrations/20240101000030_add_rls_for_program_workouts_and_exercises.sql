-- Add RLS policies for program_workouts and program_exercises
-- These policies ensure that only the program owner or the assigned client can access workout data.

-- Enable RLS on program_workouts table
ALTER TABLE public.program_workouts ENABLE ROW LEVEL SECURITY;

-- Allow owners and assigned clients to read workouts
CREATE POLICY "Enable read access for owners and assigned clients"
ON public.program_workouts
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.programs
    WHERE
      programs.id = program_workouts.program_id AND
      (programs.user_id = auth.uid() OR programs.assigned_to_client = auth.uid())
  )
);

-- Allow only the program owner to create, update, or delete workouts
CREATE POLICY "Enable insert/update/delete for program owners"
ON public.program_workouts
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.programs
    WHERE
      programs.id = program_workouts.program_id AND
      programs.user_id = auth.uid()
  )
);

-- Enable RLS on program_exercises table
ALTER TABLE public.program_exercises ENABLE ROW LEVEL SECURITY;

-- Allow owners and assigned clients to read exercises
CREATE POLICY "Enable read access for owners and assigned clients on exercises"
ON public.program_exercises
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.program_workouts
    JOIN public.programs ON programs.id = program_workouts.program_id
    WHERE
      program_workouts.id = program_exercises.workout_id AND
      (programs.user_id = auth.uid() OR programs.assigned_to_client = auth.uid())
  )
);

-- Allow only the program owner to create, update, or delete exercises
CREATE POLICY "Enable insert/update/delete for program owners on exercises"
ON public.program_exercises
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.program_workouts
    JOIN public.programs ON programs.id = program_workouts.program_id
    WHERE
      program_workouts.id = program_exercises.workout_id AND
      programs.user_id = auth.uid()
  )
);