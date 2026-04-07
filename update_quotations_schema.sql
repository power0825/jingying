-- Add client_id to quotations table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotations' AND column_name='client_id') THEN
        ALTER TABLE quotations ADD COLUMN client_id UUID REFERENCES customers(id) ON DELETE SET NULL;
    END IF;
END $$;
