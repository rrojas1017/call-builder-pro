export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          project_id: string
          source_type: string
          source_url: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          project_id: string
          source_type?: string
          source_url?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          source_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          source_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          source_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_specs: {
        Row: {
          business_hours: Json | null
          business_rules: Json | null
          consent_required: boolean
          disclosure_required: boolean | null
          disclosure_text: string | null
          disqualification_rules: Json | null
          escalation_rules: Json | null
          from_number: string | null
          humanization_notes: Json | null
          id: string
          interruption_threshold: number | null
          language: string
          mode: string | null
          must_collect_fields: Json | null
          opening_line: string | null
          project_id: string
          pronunciation_guide: Json | null
          qualification_rules: Json | null
          research_sources: Json | null
          retry_policy: Json | null
          speaking_speed: number | null
          success_definition: string | null
          temperature: number | null
          tone_style: string | null
          transfer_phone_number: string | null
          transfer_required: boolean | null
          updated_at: string
          use_case: string
          version: number
          voice_id: string | null
        }
        Insert: {
          business_hours?: Json | null
          business_rules?: Json | null
          consent_required?: boolean
          disclosure_required?: boolean | null
          disclosure_text?: string | null
          disqualification_rules?: Json | null
          escalation_rules?: Json | null
          from_number?: string | null
          humanization_notes?: Json | null
          id?: string
          interruption_threshold?: number | null
          language?: string
          mode?: string | null
          must_collect_fields?: Json | null
          opening_line?: string | null
          project_id: string
          pronunciation_guide?: Json | null
          qualification_rules?: Json | null
          research_sources?: Json | null
          retry_policy?: Json | null
          speaking_speed?: number | null
          success_definition?: string | null
          temperature?: number | null
          tone_style?: string | null
          transfer_phone_number?: string | null
          transfer_required?: boolean | null
          updated_at?: string
          use_case?: string
          version?: number
          voice_id?: string | null
        }
        Update: {
          business_hours?: Json | null
          business_rules?: Json | null
          consent_required?: boolean
          disclosure_required?: boolean | null
          disclosure_text?: string | null
          disqualification_rules?: Json | null
          escalation_rules?: Json | null
          from_number?: string | null
          humanization_notes?: Json | null
          id?: string
          interruption_threshold?: number | null
          language?: string
          mode?: string | null
          must_collect_fields?: Json | null
          opening_line?: string | null
          project_id?: string
          pronunciation_guide?: Json | null
          qualification_rules?: Json | null
          research_sources?: Json | null
          retry_policy?: Json | null
          speaking_speed?: number | null
          success_definition?: string | null
          temperature?: number | null
          tone_style?: string | null
          transfer_phone_number?: string | null
          transfer_required?: boolean | null
          updated_at?: string
          use_case?: string
          version?: number
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_specs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          bland_call_id: string | null
          campaign_id: string | null
          contact_id: string | null
          cost_estimate_usd: number | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          evaluation: Json | null
          extracted_data: Json | null
          id: string
          org_id: string
          outcome: string | null
          project_id: string
          recording_url: string | null
          started_at: string | null
          summary: Json | null
          transcript: string | null
          version: number
        }
        Insert: {
          bland_call_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          cost_estimate_usd?: number | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          evaluation?: Json | null
          extracted_data?: Json | null
          id?: string
          org_id: string
          outcome?: string | null
          project_id: string
          recording_url?: string | null
          started_at?: string | null
          summary?: Json | null
          transcript?: string | null
          version?: number
        }
        Update: {
          bland_call_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          cost_estimate_usd?: number | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          evaluation?: Json | null
          extracted_data?: Json | null
          id?: string
          org_id?: string
          outcome?: string | null
          project_id?: string
          recording_url?: string | null
          started_at?: string | null
          summary?: Json | null
          transcript?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          max_concurrent_calls: number
          name: string
          project_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_concurrent_calls?: number
          name: string
          project_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_concurrent_calls?: number
          name?: string
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          attempts: number
          bland_call_id: string | null
          called_at: string | null
          campaign_id: string
          created_at: string
          id: string
          last_error: string | null
          name: string
          phone: string
          status: string
        }
        Insert: {
          attempts?: number
          bland_call_id?: string | null
          called_at?: string | null
          campaign_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          name: string
          phone: string
          status?: string
        }
        Update: {
          attempts?: number
          bland_call_id?: string | null
          called_at?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          name?: string
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          approved: boolean
          approved_by: string | null
          call_id: string
          created_at: string
          id: string
          issues: Json | null
          overall_score: number | null
          recommended_fixes: Json | null
          rubric: Json | null
        }
        Insert: {
          approved?: boolean
          approved_by?: string | null
          call_id: string
          created_at?: string
          id?: string
          issues?: Json | null
          overall_score?: number | null
          recommended_fixes?: Json | null
          rubric?: Json | null
        }
        Update: {
          approved?: boolean
          approved_by?: string | null
          call_id?: string
          created_at?: string
          id?: string
          issues?: Json | null
          overall_score?: number | null
          recommended_fixes?: Json | null
          rubric?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      global_human_behaviors: {
        Row: {
          content: string
          created_at: string
          id: string
          source_agent_id: string | null
          source_type: string
          source_url: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          source_agent_id?: string | null
          source_type?: string
          source_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          source_agent_id?: string | null
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_human_behaviors_source_agent_id_fkey"
            columns: ["source_agent_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      improvements: {
        Row: {
          change_summary: string | null
          created_at: string
          from_version: number
          id: string
          patch: Json | null
          project_id: string
          to_version: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          from_version: number
          id?: string
          patch?: Json | null
          project_id: string
          to_version: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          from_version?: number
          id?: string
          patch?: Json | null
          project_id?: string
          to_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "improvements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          org_id: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      test_run_contacts: {
        Row: {
          bland_call_id: string | null
          called_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error: string | null
          evaluation: Json | null
          extracted_data: Json | null
          id: string
          name: string
          outcome: string | null
          phone: string
          recording_url: string | null
          status: string
          test_run_id: string
          transcript: string | null
        }
        Insert: {
          bland_call_id?: string | null
          called_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          evaluation?: Json | null
          extracted_data?: Json | null
          id?: string
          name: string
          outcome?: string | null
          phone: string
          recording_url?: string | null
          status?: string
          test_run_id: string
          transcript?: string | null
        }
        Update: {
          bland_call_id?: string | null
          called_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          evaluation?: Json | null
          extracted_data?: Json | null
          id?: string
          name?: string
          outcome?: string | null
          phone?: string
          recording_url?: string | null
          status?: string
          test_run_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_run_contacts_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          agent_instructions_text: string | null
          completed_at: string | null
          concurrency: number
          created_at: string | null
          id: string
          max_calls: number
          name: string
          org_id: string
          project_id: string
          spec_version: number | null
          status: string
        }
        Insert: {
          agent_instructions_text?: string | null
          completed_at?: string | null
          concurrency?: number
          created_at?: string | null
          id?: string
          max_calls?: number
          name: string
          org_id: string
          project_id: string
          spec_version?: number | null
          status?: string
        }
        Update: {
          agent_instructions_text?: string | null
          completed_at?: string | null
          concurrency?: number
          created_at?: string | null
          id?: string
          max_calls?: number
          name?: string
          org_id?: string
          project_id?: string
          spec_version?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wizard_questions: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          order_index: number
          project_id: string
          question: string
          rationale: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          order_index?: number
          project_id: string
          question: string
          rationale?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          order_index?: number
          project_id?: string
          question?: string
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wizard_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "analyst" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "analyst", "viewer"],
    },
  },
} as const
