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
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      bank_ledger: {
        Row: {
          amount: number
          created_at: string
          currency: string
          date: string
          direction: string
          from_label: string | null
          id: string
          reference: string | null
          to_label: string | null
          transfer_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          date?: string
          direction: string
          from_label?: string | null
          id?: string
          reference?: string | null
          to_label?: string | null
          transfer_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          date?: string
          direction?: string
          from_label?: string | null
          id?: string
          reference?: string | null
          to_label?: string | null
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_ledger_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      bet_legs: {
        Row: {
          account_id: string
          bet_id: string
          created_at: string
          free_bet_type: string | null
          id: string
          is_free_bet: boolean
          leg_number: number
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
          leg_number?: number
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
          leg_number?: number
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
      bets: {
        Row: {
          bookie_id: string
          clv: number | null
          created_at: string
          currency: string
          date_placed: string
          event: string
          id: string
          is_free_bet: boolean
          market: string
          notes: string | null
          odds: number
          outcome: string
          pair_id: string | null
          return: number
          stake: number
          type: string
          updated_at: string
        }
        Insert: {
          bookie_id: string
          clv?: number | null
          created_at?: string
          currency?: string
          date_placed: string
          event: string
          id?: string
          is_free_bet?: boolean
          market: string
          notes?: string | null
          odds?: number
          outcome?: string
          pair_id?: string | null
          return?: number
          stake?: number
          type?: string
          updated_at?: string
        }
        Update: {
          bookie_id?: string
          clv?: number | null
          created_at?: string
          currency?: string
          date_placed?: string
          event?: string
          id?: string
          is_free_bet?: boolean
          market?: string
          notes?: string | null
          odds?: number
          outcome?: string
          pair_id?: string | null
          return?: number
          stake?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_bookie_id_fkey"
            columns: ["bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
        ]
      }
      bets_v2: {
        Row: {
          bet_type: string
          created_at: string
          date_placed: string
          event: string
          id: string
          market: string | null
          notes: string | null
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          bet_type: string
          created_at?: string
          date_placed?: string
          event: string
          id?: string
          market?: string | null
          notes?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          bet_type?: string
          created_at?: string
          date_placed?: string
          event?: string
          id?: string
          market?: string | null
          notes?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bookies: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          id: string
          min_threshold: number
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_threshold?: number
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          min_threshold?: number
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
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
      transfers: {
        Row: {
          amount: number
          bank_cleared_date: string | null
          created_at: string
          currency: string
          deposit_date: string | null
          from_bookie_id: string | null
          id: string
          notes: string | null
          reference: string | null
          status: string
          to_bookie_id: string | null
          updated_at: string
          withdraw_date: string | null
        }
        Insert: {
          amount: number
          bank_cleared_date?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          from_bookie_id?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_bookie_id?: string | null
          updated_at?: string
          withdraw_date?: string | null
        }
        Update: {
          amount?: number
          bank_cleared_date?: string | null
          created_at?: string
          currency?: string
          deposit_date?: string | null
          from_bookie_id?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          status?: string
          to_bookie_id?: string | null
          updated_at?: string
          withdraw_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_bookie_id_fkey"
            columns: ["from_bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_bookie_id_fkey"
            columns: ["to_bookie_id"]
            isOneToOne: false
            referencedRelation: "bookies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      settle_leg_with_ledger: {
        Args: { p_leg_id: string; p_outcome: string; p_settled_at?: string }
        Returns: undefined
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
