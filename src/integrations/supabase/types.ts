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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          colour: string | null
          created_at: string
          currency: string
          icon: string | null
          id: string
          is_active: boolean
          kind: string
          min_threshold: number
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          colour?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind: string
          min_threshold?: number
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          colour?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          min_threshold?: number
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bet_import_log: {
        Row: {
          action: string
          bet_id: string | null
          created_at: string
          diff: Json
          external_ref: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          bet_id?: string | null
          created_at?: string
          diff?: Json
          external_ref?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          bet_id?: string | null
          created_at?: string
          diff?: Json
          external_ref?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bet_legs: {
        Row: {
          account_id: string
          bet_id: string
          created_at: string
          free_bet_type: string | null
          id: string
          is_free_bet: boolean
          last_manual_edit_at: string | null
          leg_number: number
          manually_overridden_fields: string[]
          market: string | null
          odds: number
          outcome: string
          selection: string | null
          settled_at: string | null
          stake: number
          stake_prefunded: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          bet_id: string
          created_at?: string
          free_bet_type?: string | null
          id?: string
          is_free_bet?: boolean
          last_manual_edit_at?: string | null
          leg_number?: number
          manually_overridden_fields?: string[]
          market?: string | null
          odds?: number
          outcome?: string
          selection?: string | null
          settled_at?: string | null
          stake?: number
          stake_prefunded?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          bet_id?: string
          created_at?: string
          free_bet_type?: string | null
          id?: string
          is_free_bet?: boolean
          last_manual_edit_at?: string | null
          leg_number?: number
          manually_overridden_fields?: string[]
          market?: string | null
          odds?: number
          outcome?: string
          selection?: string | null
          settled_at?: string | null
          stake?: number
          stake_prefunded?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_legs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_legs_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      bets_v2: {
        Row: {
          bet_type: string
          clv_pct: number | null
          created_at: string
          date_placed: string
          ev_pct: number | null
          event: string
          event_time: string | null
          external_ref: string | null
          fair_odds: number | null
          id: string
          imported_at: string | null
          is_archived: boolean
          last_manual_edit_at: string | null
          league: string | null
          manually_overridden_fields: string[]
          market: string | null
          notes: string | null
          source: string
          sport: string | null
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          bet_type: string
          clv_pct?: number | null
          created_at?: string
          date_placed?: string
          ev_pct?: number | null
          event: string
          event_time?: string | null
          external_ref?: string | null
          fair_odds?: number | null
          id?: string
          imported_at?: string | null
          is_archived?: boolean
          last_manual_edit_at?: string | null
          league?: string | null
          manually_overridden_fields?: string[]
          market?: string | null
          notes?: string | null
          source?: string
          sport?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          bet_type?: string
          clv_pct?: number | null
          created_at?: string
          date_placed?: string
          ev_pct?: number | null
          event?: string
          event_time?: string | null
          external_ref?: string | null
          fair_odds?: number | null
          id?: string
          imported_at?: string | null
          is_archived?: boolean
          last_manual_edit_at?: string | null
          league?: string | null
          manually_overridden_fields?: string[]
          market?: string | null
          notes?: string | null
          source?: string
          sport?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          bet_leg_id: string | null
          created_at: string
          entry_type: string
          id: string
          memo: string | null
          occurred_at: string
          transfer_group_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          bet_leg_id?: string | null
          created_at?: string
          entry_type: string
          id?: string
          memo?: string | null
          occurred_at?: string
          transfer_group_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          bet_leg_id?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          memo?: string | null
          occurred_at?: string
          transfer_group_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_bet_leg_id_fkey"
            columns: ["bet_leg_id"]
            isOneToOne: false
            referencedRelation: "bet_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_owner: boolean
          setup_completed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_owner?: boolean
          setup_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_owner?: boolean
          setup_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfer_imports: {
        Row: {
          created_at: string
          id: string
          import_key: string
          notes: string | null
          source: string
          transfer_group_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_key: string
          notes?: string | null
          source?: string
          transfer_group_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          import_key?: string
          notes?: string | null
          source?: string
          transfer_group_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_leg_ledger: {
        Args: { p_leg_id: string; p_memo?: string; p_occurred_at: string }
        Returns: undefined
      }
      archive_bet: { Args: { p_bet_id: string }; Returns: undefined }
      create_bet_with_ledger: {
        Args: {
          p_bet_type: string
          p_date: string
          p_event: string
          p_legs: Json
          p_market: string
          p_notes: string
          p_tags: string[]
        }
        Returns: string
      }
      create_transfer_with_ledger: {
        Args: {
          p_amount: number
          p_from: string
          p_memo?: string
          p_to: string
          p_when?: string
        }
        Returns: string
      }
      import_bets_batch: { Args: { p_rows: Json }; Returns: Json }
      import_transfers_batch: { Args: { p_rows: Json }; Returns: Json }
      leg_return: {
        Args: {
          p_free_type: string
          p_is_free: boolean
          p_odds: number
          p_outcome: string
          p_stake: number
        }
        Returns: number
      }
      reimport_bet: {
        Args: {
          p_bet_id: string
          p_incoming: Json
          p_overwrite_fields?: string[]
        }
        Returns: string
      }
      reverse_leg_ledger: {
        Args: { p_leg_id: string; p_memo?: string }
        Returns: undefined
      }
      reverse_transfer_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      settle_leg_with_ledger: {
        Args: { p_leg_id: string; p_outcome: string; p_settled_at?: string }
        Returns: undefined
      }
      transfer_bookie_to_bookie: {
        Args: {
          p_amount: number
          p_bank: string
          p_from: string
          p_memo?: string
          p_to: string
          p_when?: string
        }
        Returns: string
      }
      update_account_with_correction: {
        Args: {
          p_currency?: string
          p_id: string
          p_is_active?: boolean
          p_memo?: string
          p_min_threshold?: number
          p_name?: string
          p_notes?: string
          p_target_balance?: number
        }
        Returns: string
      }
      update_bet_with_ledger: {
        Args: {
          p_bet: Json
          p_bet_id: string
          p_legs: Json
          p_mark_manual?: boolean
        }
        Returns: string
      }
      update_transfer_group: {
        Args: { p_group_id: string; p_memo?: string; p_when?: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
