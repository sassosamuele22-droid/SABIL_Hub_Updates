-- Training permission stabilization used by v0.7.8
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_sessions TO authenticated;
DROP POLICY IF EXISTS "management manages trainings" ON public.training_sessions;
CREATE POLICY "management manages trainings" ON public.training_sessions
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['owner'::text,'admin'::text,'manager'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['owner'::text,'admin'::text,'manager'::text])
  )
);
